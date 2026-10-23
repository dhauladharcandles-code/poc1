import { EVENTS } from '../tracking-plan';
import { docHeight, isIgnored } from '../dom';
import type { Plugin, TrackerApi } from '../types';

const MILESTONES = [25, 50, 75, 90, 100];

/**
 * Scroll depth for the page and for any `data-track-scroll="name"` container (e.g. the events panel).
 * Milestones the first viewport already covers are reported too, so "% of page views that saw X%" is exact.
 */
export function scrollPlugin(): Plugin {
  let tracker: TrackerApi;
  let pageHit = new Set<number>();
  const containerHit = new Map<string, Set<number>>();
  let lastY = 0;
  let dir: 1 | -1 | 0 = 0;
  let runInDir = 0;
  let raf = 0;
  let pendingTarget: EventTarget | null = null;

  function stats() {
    tracker.memory.scroll ??= { maxPct: 0, reversals: 0, distancePx: 0 };
    return tracker.memory.scroll;
  }

  function report(container: string, pct: number, hit: Set<number>) {
    for (const m of MILESTONES) {
      if (pct >= m - 0.5 && !hit.has(m)) {
        hit.add(m);
        tracker.track(EVENTS.ScrollDepthReached.name, {
          container,
          depth_pct: m,
          time_to_reach_ms: Date.now() - tracker.memory.pageViewStartedAt,
        });
      }
    }
  }

  function measurePage() {
    const y = window.scrollY;
    const s = stats();
    const delta = y - lastY;
    if (delta !== 0) {
      s.distancePx += Math.abs(delta);
      const d = delta > 0 ? 1 : -1;
      if (dir !== 0 && d !== dir && runInDir > 150) s.reversals += 1;
      runInDir = d === dir ? runInDir + Math.abs(delta) : Math.abs(delta);
      dir = d;
      lastY = y;
    }
    const pct = Math.min(100, ((y + window.innerHeight) / docHeight()) * 100);
    s.maxPct = Math.max(s.maxPct, Math.round(pct));
    report('page', pct, pageHit);
  }

  function measureContainer(el: Element) {
    const name = el.getAttribute('data-track-scroll');
    if (!name) return;
    const pct = Math.min(100, ((el.scrollTop + el.clientHeight) / Math.max(1, el.scrollHeight)) * 100);
    let hit = containerHit.get(name);
    if (!hit) containerHit.set(name, (hit = new Set()));
    report(name, pct, hit);
  }

  function onScroll(e: Event) {
    pendingTarget = e.target;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const t = pendingTarget;
      if (t === document || t === document.documentElement || t === window) measurePage();
      else if (t instanceof Element && !isIgnored(t) && t.hasAttribute('data-track-scroll')) measureContainer(t);
    });
  }

  return {
    name: 'scroll',
    setup(t) {
      tracker = t;
      lastY = window.scrollY;
      document.addEventListener('scroll', onScroll, { capture: true, passive: true });
      // Initial viewport coverage once layout has settled.
      const initial = setTimeout(measurePage, 800);
      return () => {
        clearTimeout(initial);
        document.removeEventListener('scroll', onScroll, { capture: true });
        if (raf) cancelAnimationFrame(raf);
      };
    },
    onPage() {
      pageHit = new Set();
      containerHit.clear();
      tracker.memory.scroll = { maxPct: 0, reversals: 0, distancePx: 0 };
      lastY = window.scrollY;
      dir = 0;
      runInDir = 0;
      setTimeout(measurePage, 800);
    },
  };
}
