import { EVENTS } from './tracking-plan';
import { classifyEntry, resolveInvestigation, resolveSession, resolveTabId, touchInvestigation, touchSession, uuid } from './ids';
import { detectType, hashText } from './dom';
import type {
  AgentIdentity,
  CommonContext,
  Destination,
  FlushReason,
  InvestigationInput,
  Plugin,
  Props,
  TrackedEvent,
  TrackerApi,
  TrackerConfig,
  TrackerMemory,
} from './types';

/** Summary/heartbeat events don't count as "the agent did something". */
const PASSIVE = new Set<string>([
  EVENTS.EngagementRecorded.name,
  EVENTS.ElementExposure.name,
  EVENTS.ElementViewed.name,
  EVENTS.ScrollDepthReached.name,
  EVENTS.PageLeft.name,
  EVENTS.PageReturned.name,
  EVENTS.AgentIdle.name,
  EVENTS.AgentActive.name,
  EVENTS.EmptyStateShown.name,
  EVENTS.ErrorEncountered.name,
  EVENTS.InvestigationStarted.name,
  EVENTS.RageClick.name,
  EVENTS.DeadClick.name,
]);

/** Events fired before the first page() (child effects run before the page's own effect) wait this long for page context. */
const PRE_PAGE_HOLD_MS = 2_000;

export interface CreateTrackerOptions {
  config: TrackerConfig;
  destinations: Destination[];
  plugins: Plugin[];
  /** Disable everything (heatmap iframes, bots…). */
  disabled?: boolean;
}

export function createTracker({ config, destinations, plugins, disabled = false }: CreateTrackerOptions): TrackerApi & { shutdown(): void } {
  const now = () => Date.now();
  const listeners = new Set<(e: TrackedEvent) => void>();
  const memory: TrackerMemory = { pageViewStartedAt: now() };
  const cleanups: (() => void)[] = [];
  let pageCount = 0;
  let prePage: [string, Props][] | null = [];
  let prePageTimer: ReturnType<typeof setTimeout> | null = null;

  let pendingInvestigationStart: Props | null = null;
  function emitInvestigationStart() {
    if (!pendingInvestigationStart) return;
    const props = pendingInvestigationStart;
    pendingInvestigationStart = null;
    api.track(EVENTS.InvestigationStarted.name, props);
  }

  function drainPrePage() {
    if (prePageTimer) clearTimeout(prePageTimer);
    prePageTimer = null;
    const held = prePage ?? [];
    prePage = null;
    for (const [event, props] of held) api.track(event, props);
  }

  const href = typeof location !== 'undefined' ? location.href : 'http://localhost/';
  const referrer = typeof document !== 'undefined' ? document.referrer : '';
  const entry = classifyEntry(href, referrer);
  const { session } = resolveSession(now(), () => entry);
  const tab = resolveTabId();

  const ctx: CommonContext = {
    session_id: session.id,
    tab_id: tab.id,
    page_view_id: uuid(),
    replay_id: uuid(),
    zone: config.zone,
    page_type: 'unknown',
    investigation_id: null,
    order_id: null,
    ticket_id: null,
    entry_point: session.entry_point,
    app_version: config.appVersion ?? '0.1.0',
    seq: 0,
  };

  function emitLocal(e: TrackedEvent) {
    for (const l of listeners) {
      try {
        l(e);
      } catch {
        /* listener errors never break tracking */
      }
    }
  }

  function enrich(props: Props): Props {
    ctx.seq += 1;
    return { ...ctx, ...props };
  }

  function touch() {
    const t = now();
    touchSession(t);
    if (ctx.order_id) touchInvestigation(ctx.order_id, t);
  }

  const api: TrackerApi & { shutdown(): void } = {
    config,
    memory,
    isEnabled: () => !disabled,

    track(event, props = {}) {
      if (disabled) return;
      if (prePage) {
        // Hold until the first page view so the event carries page_type / page_view_id / investigation.
        prePage.push([event, props]);
        prePageTimer ??= setTimeout(drainPrePage, PRE_PAGE_HOLD_MS);
        return;
      }
      const full = enrich(props);
      if (!PASSIVE.has(event)) {
        memory.lastAction = { event, element_id: (props.element_id as string | undefined) ?? undefined, at: now() };
        touch();
      }
      if (config.debug) console.debug('[tracker]', event, full);
      for (const d of destinations) {
        try {
          d.track(event, full);
        } catch (err) {
          if (config.debug) console.warn(`[tracker] destination ${d.name} failed`, err);
        }
      }
      emitLocal({ type: 'track', name: event, props: full, at: now() });
    },

    page(pageType, props = {}) {
      if (disabled) return;
      // Close out the previous page view (SPA route change) before starting a new one.
      if (pageCount > 0) api.flush('route_change');
      ctx.page_view_id = uuid();
      ctx.page_type = pageType;
      memory.pageViewStartedAt = now();
      for (const p of plugins) p.onPage?.();
      pageCount += 1;
      // Only the first page of a document has a real navigation type; later ones are client-side route changes.
      const full = enrich({ ...props, load_type: pageCount === 1 ? navigationType() : 'spa', referrer_host: entry.referrer_host });
      touch();
      for (const d of destinations) {
        try {
          d.page(pageType, full);
        } catch {
          /* ignore */
        }
      }
      emitLocal({ type: 'page', name: pageType, props: full, at: now() });
      // Release events held for page context, after the investigation start so the journey reads in order.
      const held = prePage;
      prePage = null;
      if (prePageTimer) clearTimeout(prePageTimer);
      emitInvestigationStart();
      for (const [event, heldProps] of held ?? []) api.track(event, heldProps);
    },

    identify(agent: AgentIdentity) {
      if (disabled) return;
      for (const d of destinations) {
        try {
          d.identify(agent);
        } catch {
          /* ignore */
        }
      }
      emitLocal({ type: 'identify', name: agent.id, props: { ...agent }, at: now() });
    },

    setInvestigation(input: InvestigationInput | null) {
      if (!input) {
        ctx.investigation_id = null;
        ctx.order_id = null;
        ctx.ticket_id = null;
        return;
      }
      const { state, isNew } = resolveInvestigation(input, now());
      ctx.investigation_id = state.id;
      ctx.order_id = state.orderId;
      ctx.ticket_id = state.ticketId;
      if (isNew) {
        // Emitted right after the page view that follows (usePageView calls page() next), so it shares its page_view_id.
        pendingInvestigationStart = {
          order_status: input.orderStatus ?? null,
          ticket_reason: state.reason,
          // Entry for *this* order: a hop from the queue is internal, a pasted link is direct, etc.
          entry_point_order: classifyEntry(typeof location !== 'undefined' ? location.href : href, typeof document !== 'undefined' ? document.referrer : '').entry_point,
          referrer_host: entry.referrer_host,
        };
        setTimeout(emitInvestigationStart, 0);
      }
    },

    getContext: () => ({ ...ctx }),

    flush(reason: FlushReason = 'manual') {
      if (disabled) return;
      for (const p of plugins) {
        try {
          p.flush?.(reason);
        } catch {
          /* ignore */
        }
      }
      const unloading = reason === 'pagehide' || reason === 'hidden';
      for (const d of destinations) d.flush?.({ unloading });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    copied(text, field, props = {}) {
      memory.lastCopy = { field, detected_type: detectType(text), at: now() };
      api.track(EVENTS.ContentCopied.name, {
        field,
        method: 'button',
        detected_type: detectType(text),
        text_length: text.length,
        is_full_field: true,
        contains_pii: false,
        text_hash: hashText(text),
        ...props,
      });
    },

    shutdown() {
      if (prePage) drainPrePage();
      api.flush('manual');
      for (const c of cleanups.splice(0)) c();
      listeners.clear();
    },
  };

  if (!disabled) {
    for (const d of destinations) {
      try {
        void d.init?.(api);
      } catch (err) {
        if (config.debug) console.warn(`[tracker] destination ${d.name} init failed`, err);
      }
    }
    for (const p of plugins) {
      try {
        const cleanup = p.setup(api);
        if (cleanup) cleanups.push(cleanup);
      } catch (err) {
        if (config.debug) console.warn(`[tracker] plugin ${p.name} failed`, err);
      }
    }
  }

  return api;
}

function navigationType(): string {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type ?? 'navigate';
  } catch {
    return 'navigate';
  }
}
