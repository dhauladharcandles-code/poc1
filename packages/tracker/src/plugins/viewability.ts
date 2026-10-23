import { EVENTS } from '../tracking-plan';
import { isIgnored, round, sectionOf } from '../dom';
import type { FlushReason, Plugin, TrackerApi } from '../types';

export interface ViewabilityOptions {
  /** Fraction of the element that must be visible… */
  minRatio?: number;
  /** …for this long, continuously, to count as "viewed" (IAB uses 50% / 1s). */
  minDwellMs?: number;
  hoverIntentMs?: number;
}

interface ElState {
  el: Element;
  id: string;
  key: string | null;
  section: string | null;
  inView: boolean;
  inViewSince: number | null;
  visibleMs: number;
  maxRatio: number;
  viewed: boolean;
  hoverSince: number | null;
  hoverMs: number;
  hoverEmitted: boolean;
}

/** Repeated elements without a data-track-key get a positional key so per-instance averages stay correct. */
function instanceKey(el: Element): string | null {
  const id = el.getAttribute('data-track-id')!;
  const all = document.querySelectorAll(`[data-track-id="${id.replace(/["\\]/g, '\\$&')}"]`);
  return all.length > 1 ? `#${Array.prototype.indexOf.call(all, el)}` : null;
}

/**
 * Viewability + hover dwell for every `[data-track-id]` element, including ones that mount later
 * (drawers, expanded rows). Dwell only accrues while the tab is visible.
 */
export function viewabilityPlugin(opts: ViewabilityOptions = {}): Plugin {
  const minRatio = opts.minRatio ?? 0.5;
  const minDwellMs = opts.minDwellMs ?? 1_000;
  const hoverIntentMs = opts.hoverIntentMs ?? 800;

  let tracker: TrackerApi;
  const states = new Map<Element, ElState>();
  let io: IntersectionObserver | null = null;
  let mo: MutationObserver | null = null;
  let hovered = new Set<Element>();
  const hoverTimers = new Map<Element, ReturnType<typeof setTimeout>>();

  const pageVisible = () => document.visibilityState === 'visible';

  function observe(el: Element) {
    if (states.has(el) || isIgnored(el)) return;
    states.set(el, {
      el,
      id: el.getAttribute('data-track-id')!,
      key: el.getAttribute('data-track-key') ?? instanceKey(el),
      section: sectionOf(el),
      inView: false,
      inViewSince: null,
      visibleMs: 0,
      maxRatio: 0,
      viewed: false,
      hoverSince: null,
      hoverMs: 0,
      hoverEmitted: false,
    });
    io?.observe(el);
  }

  function scan(root: ParentNode) {
    if (root instanceof Element && root.hasAttribute('data-track-id')) observe(root);
    root.querySelectorAll?.('[data-track-id]').forEach(observe);
  }

  function settle(s: ElState, now: number) {
    if (s.inViewSince !== null) {
      s.visibleMs += now - s.inViewSince;
      s.inViewSince = pageVisible() && s.inView ? now : null;
    }
    if (s.hoverSince !== null) {
      s.hoverMs += now - s.hoverSince;
      s.hoverSince = now;
    }
  }

  function onIntersect(entries: IntersectionObserverEntry[]) {
    const now = Date.now();
    const vh = window.innerHeight || 1;
    for (const entry of entries) {
      const s = states.get(entry.target);
      if (!s) continue;
      s.maxRatio = Math.max(s.maxRatio, entry.intersectionRatio);
      // Tall elements can never be 50% visible, so "fills half the viewport" also counts.
      const inView = entry.isIntersecting && (entry.intersectionRatio >= minRatio || entry.intersectionRect.height >= vh * 0.5);
      if (inView && !s.inView) {
        s.inView = true;
        if (pageVisible()) s.inViewSince = now;
      } else if (!inView && s.inView) {
        s.inView = false;
        settle(s, now);
        s.inViewSince = null;
      }
    }
  }

  function checkViewed() {
    const now = Date.now();
    for (const s of states.values()) {
      if (s.viewed || s.inViewSince === null) continue;
      if (now - s.inViewSince >= minDwellMs) {
        s.viewed = true;
        if (s.el.getAttribute('data-track-view-event') === 'off') continue;
        tracker.track(EVENTS.ElementViewed.name, {
          element_id: s.id,
          element_key: s.key,
          section: s.section,
          time_to_view_ms: now - tracker.memory.pageViewStartedAt,
        });
      }
    }
  }

  function onVisibility() {
    const now = Date.now();
    for (const s of states.values()) {
      if (pageVisible()) {
        if (s.inView) s.inViewSince = now;
      } else {
        settle(s, now);
        s.inViewSince = null;
        if (s.hoverSince !== null) s.hoverSince = null;
      }
    }
    if (!pageVisible()) hovered = new Set();
  }

  function anchorChain(target: EventTarget | null): Set<Element> {
    const chain = new Set<Element>();
    let el = target instanceof Element ? target.closest('[data-track-id]') : null;
    while (el) {
      if (states.has(el)) chain.add(el);
      el = el.parentElement?.closest('[data-track-id]') ?? null;
    }
    return chain;
  }

  function onPointerOver(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    const next = isIgnored(e.target as Node) ? new Set<Element>() : anchorChain(e.target);
    const now = Date.now();
    for (const el of hovered) {
      if (next.has(el)) continue;
      const s = states.get(el);
      if (s && s.hoverSince !== null) {
        s.hoverMs += now - s.hoverSince;
        s.hoverSince = null;
      }
      const timer = hoverTimers.get(el);
      if (timer) clearTimeout(timer);
      hoverTimers.delete(el);
    }
    for (const el of next) {
      if (hovered.has(el)) continue;
      const s = states.get(el);
      if (!s) continue;
      s.hoverSince = now;
      if (el.hasAttribute('data-track-hover') && !s.hoverEmitted) {
        hoverTimers.set(
          el,
          setTimeout(() => {
            if (s.hoverSince === null) return;
            s.hoverEmitted = true;
            tracker.track(EVENTS.ElementHovered.name, {
              element_id: s.id,
              element_key: s.key,
              section: s.section,
              hover_ms: hoverIntentMs,
            });
          }, hoverIntentMs),
        );
      }
    }
    hovered = next;
  }

  function onPointerLeaveWindow(e: PointerEvent) {
    if (e.relatedTarget === null) onPointerOver({ target: null, pointerType: e.pointerType } as unknown as PointerEvent);
  }

  return {
    name: 'viewability',
    setup(t) {
      tracker = t;
      io = new IntersectionObserver(onIntersect, { threshold: [0, 0.25, 0.5, 0.75, 1] });
      scan(document);
      mo = new MutationObserver((records) => {
        for (const r of records) r.addedNodes.forEach((n) => n instanceof Element && scan(n));
      });
      mo.observe(document.body, { childList: true, subtree: true });
      const timer = setInterval(checkViewed, 250);
      document.addEventListener('visibilitychange', onVisibility);
      document.addEventListener('pointerover', onPointerOver, { passive: true });
      document.addEventListener('pointerout', onPointerLeaveWindow, { passive: true });
      return () => {
        clearInterval(timer);
        io?.disconnect();
        mo?.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        document.removeEventListener('pointerover', onPointerOver);
        document.removeEventListener('pointerout', onPointerLeaveWindow);
        for (const timer of hoverTimers.values()) clearTimeout(timer);
      };
    },
    flush(reason: FlushReason) {
      const now = Date.now();
      const rows: Record<string, unknown>[] = [];
      for (const s of [...states.values()]) {
        settle(s, now);
        if (s.visibleMs > 0 || s.hoverMs > 0) {
          rows.push({
            element_id: s.id,
            element_key: s.key,
            section: s.section,
            visible_ms: Math.round(s.visibleMs),
            hover_ms: Math.round(s.hoverMs),
            max_ratio: round(s.maxRatio, 2),
            viewed: s.viewed,
          });
          s.visibleMs = 0;
          s.hoverMs = 0;
        }
        if (!s.el.isConnected) {
          io?.unobserve(s.el);
          states.delete(s.el);
        }
      }
      for (let i = 0; i < rows.length; i += 80) {
        tracker.track(EVENTS.ElementExposure.name, { elements: rows.slice(i, i + 80), flush_reason: reason });
      }
    },
    onPage() {
      // New page view: everything currently on screen gets a fresh "viewed" decision.
      const now = Date.now();
      for (const s of states.values()) {
        s.viewed = false;
        s.hoverEmitted = false;
        s.maxRatio = s.inView ? s.maxRatio : 0;
        if (s.inView && pageVisible()) s.inViewSince = now;
      }
      scan(document);
    },
  };
}
