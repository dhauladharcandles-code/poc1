import { EVENTS } from '../tracking-plan';
import type { FlushReason, Plugin, TrackerApi } from '../types';

export interface AttentionOptions {
  /** No input for this long while visible = idle. */
  idleMs?: number;
  /** Ignore window blurs shorter than this (alerts, devtools clicks). */
  blurDebounceMs?: number;
  /** Periodic heartbeat so long sessions still report time if the tab is killed. */
  heartbeatMs?: number;
}

type State = 'present' | 'blurred' | 'hidden';

/**
 * Where is the agent's attention? Tracks tab switches, window focus, idle time and
 * engaged time, and links leaving to the action just before it (copy → leave → return).
 */
export function attentionPlugin(opts: AttentionOptions = {}): Plugin {
  const idleMs = opts.idleMs ?? 60_000;
  const blurDebounceMs = opts.blurDebounceMs ?? 1_000;
  const heartbeatMs = opts.heartbeatMs ?? 60_000;

  let tracker: TrackerApi;
  let state: State = 'present';
  let idle = false;
  let lastInputAt = Date.now();
  let idleSince = 0;
  let lastTick = Date.now();
  let leftAt: number | null = null;
  let awayType: 'tab_hidden' | 'window_blur' | null = null;
  let leftAfterCopy = false;
  let leftCopyField: string | null = null;
  let blurTimer: ReturnType<typeof setTimeout> | null = null;
  const acc = { engaged_ms: 0, visible_ms: 0, hidden_ms: 0, blurred_ms: 0, idle_ms: 0 };

  function tick() {
    const now = Date.now();
    const dt = Math.max(0, now - lastTick);
    lastTick = now;
    if (state === 'hidden') acc.hidden_ms += dt;
    else {
      acc.visible_ms += dt;
      if (state === 'blurred') acc.blurred_ms += dt;
      if (idle) acc.idle_ms += dt;
      else if (state === 'present') acc.engaged_ms += dt;
    }
  }

  function leave(type: 'tab_hidden' | 'window_blur') {
    const now = Date.now();
    const m = tracker.memory;
    const sinceCopy = m.lastCopy ? now - m.lastCopy.at : null;
    leftAt = now;
    awayType = type;
    leftAfterCopy = sinceCopy !== null && sinceCopy < 15_000;
    leftCopyField = leftAfterCopy ? m.lastCopy!.field : null;
    tracker.track(EVENTS.PageLeft.name, {
      leave_type: type,
      last_action: m.lastAction?.event ?? null,
      last_element_id: m.lastAction?.element_id ?? null,
      ms_since_last_action: m.lastAction ? now - m.lastAction.at : null,
      last_copy_field: m.lastCopy?.field ?? null,
      ms_since_last_copy: sinceCopy,
    });
  }

  function back() {
    if (leftAt === null) return;
    tracker.track(EVENTS.PageReturned.name, {
      away_type: awayType,
      away_ms: Date.now() - leftAt,
      left_after_copy: leftAfterCopy,
      last_copy_field: leftCopyField,
    });
    leftAt = null;
    awayType = null;
    // Coming back counts as input.
    lastInputAt = Date.now();
  }

  function onVisibility() {
    tick();
    if (document.visibilityState === 'hidden') {
      if (blurTimer) clearTimeout(blurTimer);
      if (state === 'present') leave('tab_hidden');
      else if (state === 'blurred') awayType = 'tab_hidden';
      state = 'hidden';
      tracker.flush('hidden');
    } else {
      state = document.hasFocus() ? 'present' : 'blurred';
      back();
    }
  }

  function onBlur() {
    if (document.visibilityState !== 'visible') return;
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      blurTimer = null;
      if (document.visibilityState === 'visible' && !document.hasFocus() && state === 'present') {
        tick();
        state = 'blurred';
        leave('window_blur');
      }
    }, blurDebounceMs);
  }

  function onFocus() {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
    if (state === 'blurred') {
      tick();
      state = 'present';
      back();
    }
  }

  function onInput() {
    const now = Date.now();
    lastInputAt = now;
    if (idle) {
      tick();
      idle = false;
      tracker.track(EVENTS.AgentActive.name, { idle_ms: now - idleSince });
    }
  }

  let lastMove = 0;
  function onMove() {
    const now = Date.now();
    if (now - lastMove > 500) {
      lastMove = now;
      onInput();
    }
  }

  function checkIdle() {
    const now = Date.now();
    if (!idle && state !== 'hidden' && now - lastInputAt >= idleMs) {
      tick();
      idle = true;
      idleSince = lastInputAt;
      tracker.track(EVENTS.AgentIdle.name, { idle_threshold_ms: idleMs });
    }
  }

  function onPageHide() {
    tick();
    tracker.flush('pagehide');
  }

  return {
    name: 'attention',
    setup(t) {
      tracker = t;
      state = document.visibilityState === 'hidden' ? 'hidden' : document.hasFocus() ? 'present' : 'blurred';
      lastTick = Date.now();
      const opt = { capture: true, passive: true } as const;
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
      window.addEventListener('pagehide', onPageHide);
      for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const) document.addEventListener(ev, onInput, opt);
      document.addEventListener('pointermove', onMove, opt);
      const idleTimer = setInterval(checkIdle, 1_000);
      const heartbeat = setInterval(() => {
        if (state !== 'hidden') tracker.flush('interval');
      }, heartbeatMs);
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('pagehide', onPageHide);
        for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const) document.removeEventListener(ev, onInput, opt);
        document.removeEventListener('pointermove', onMove, opt);
        clearInterval(idleTimer);
        clearInterval(heartbeat);
        if (blurTimer) clearTimeout(blurTimer);
      };
    },
    flush(reason: FlushReason) {
      tick();
      const total = acc.visible_ms + acc.hidden_ms;
      if (total <= 0) return;
      const s = tracker.memory.scroll;
      tracker.track(EVENTS.EngagementRecorded.name, {
        ...acc,
        scroll_max_pct: s?.maxPct ?? null,
        scroll_reversals: s?.reversals ?? null,
        scroll_distance_px: s?.distancePx ?? null,
        flush_reason: reason,
      });
      acc.engaged_ms = acc.visible_ms = acc.hidden_ms = acc.blurred_ms = acc.idle_ms = 0;
    },
    onPage() {
      lastInputAt = Date.now();
    },
  };
}
