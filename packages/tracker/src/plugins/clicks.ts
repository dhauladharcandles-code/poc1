import { EVENTS } from '../tracking-plan';
import { closestAnchor, docHeight, interactiveTarget, isIgnored, round, safeText, toElement } from '../dom';
import type { Plugin, TrackerApi } from '../types';

export interface ClickOptions {
  rageCount?: number;
  rageWindowMs?: number;
  rageRadiusPx?: number;
  deadClickWaitMs?: number;
}

/**
 * Every click becomes an `Element Clicked` with coordinates relative to its nearest tracked anchor,
 * so heatmaps survive different viewport sizes and layouts. Also detects rage and dead clicks.
 */
export function clicksPlugin(opts: ClickOptions = {}): Plugin {
  const rageCount = opts.rageCount ?? 3;
  const rageWindowMs = opts.rageWindowMs ?? 800;
  const rageRadius = opts.rageRadiusPx ?? 32;
  const deadWait = opts.deadClickWaitMs ?? 700;

  let tracker: TrackerApi;
  let recent: { x: number; y: number; at: number }[] = [];
  let rageReportedAt = 0;
  let down: { x: number; y: number } | null = null;

  const onPointerDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });

  function onClick(e: MouseEvent) {
    const target = toElement(e.target as Node);
    if (!target || isIgnored(target)) return;
    const anchor = closestAnchor(target);
    const interactive = interactiveTarget(target);
    const rect = anchor?.el.getBoundingClientRect();
    const xRel = rect && rect.width ? (e.clientX - rect.left) / rect.width : null;
    const yRel = rect && rect.height ? (e.clientY - rect.top) / rect.height : null;

    tracker.track(EVENTS.ElementClicked.name, {
      element_id: anchor?.element_id ?? null,
      element_key: anchor?.element_key ?? null,
      section: anchor?.section ?? null,
      x_rel: xRel === null ? null : round(xRel),
      y_rel: yRel === null ? null : round(yRel),
      page_x: Math.round(e.pageX),
      page_y: Math.round(e.pageY),
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
      doc_h: docHeight(),
      is_interactive: !!interactive,
      target_tag: (interactive ?? target).tagName.toLowerCase(),
      target_role: (interactive ?? target).getAttribute('role'),
      target_text: safeText(interactive),
      modifier: e.metaKey || e.ctrlKey ? 'cmd' : e.shiftKey ? 'shift' : e.altKey ? 'alt' : null,
    });

    detectRage(e, anchor?.element_id ?? null, !!interactive);
    // A drag (text selection) or a double/triple click to select a word isn't a click that expects a response.
    const dragged = down !== null && Math.hypot(down.x - e.clientX, down.y - e.clientY) > 6;
    if (!(interactive instanceof HTMLAnchorElement) && !dragged && e.detail < 2) detectDead(target, anchor?.element_id ?? null, interactive);
  }

  function detectRage(e: MouseEvent, elementId: string | null, isInteractive: boolean) {
    const now = Date.now();
    recent = recent.filter((c) => now - c.at < rageWindowMs);
    recent.push({ x: e.clientX, y: e.clientY, at: now });
    const near = recent.filter((c) => Math.hypot(c.x - e.clientX, c.y - e.clientY) <= rageRadius);
    if (near.length >= rageCount && now - rageReportedAt > rageWindowMs) {
      rageReportedAt = now;
      tracker.track(EVENTS.RageClick.name, { element_id: elementId, click_count: near.length, is_interactive: isInteractive });
    }
  }

  /** Nothing changed after the click → the agent expected something that didn't happen. */
  function detectDead(target: Element, elementId: string | null, interactive: Element | null) {
    const startHref = location.href;
    const startActive = document.activeElement;
    let responded = false;
    const mo = new MutationObserver((records) => {
      if (records.some((r) => !isIgnored(r.target))) responded = true;
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    const onScroll = () => (responded = true);
    window.addEventListener('scroll', onScroll, { once: true, capture: true });
    setTimeout(() => {
      mo.disconnect();
      window.removeEventListener('scroll', onScroll, { capture: true });
      const selection = document.getSelection()?.toString() ?? '';
      if (responded || location.href !== startHref || document.activeElement !== startActive || selection.length > 0) return;
      const cursor = getComputedStyle(target).cursor;
      tracker.track(EVENTS.DeadClick.name, {
        element_id: elementId,
        kind: interactive ? 'no_response' : 'non_interactive',
        cursor,
        target_tag: target.tagName.toLowerCase(),
        target_text: safeText(target, 30),
      });
    }, deadWait);
  }

  return {
    name: 'clicks',
    setup(t) {
      tracker = t;
      document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
      document.addEventListener('click', onClick, { capture: true });
      return () => {
        document.removeEventListener('pointerdown', onPointerDown, { capture: true });
        document.removeEventListener('click', onClick, { capture: true });
      };
    },
  };
}
