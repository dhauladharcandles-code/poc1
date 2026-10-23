export type Primitive = string | number | boolean | null | undefined;
export type Props = Record<string, unknown>;

/** Properties stamped onto every event so any row can be joined back to a session, tab, replay and order. */
export interface CommonContext {
  session_id: string;
  tab_id: string;
  page_view_id: string;
  replay_id: string;
  zone: string;
  page_type: string;
  investigation_id: string | null;
  order_id: string | null;
  ticket_id: string | null;
  entry_point: string;
  app_version: string;
  seq: number;
}

export interface AgentIdentity {
  id: string;
  name?: string;
  team?: string;
  tenure_months?: number;
}

export interface Destination {
  name: string;
  init?(tracker: TrackerApi): void | Promise<void>;
  track(event: string, props: Props): void;
  page(name: string, props: Props): void;
  identify(agent: AgentIdentity): void;
  /** Called when the page is being hidden/unloaded so destinations can push what they hold. */
  flush?(opts: { unloading: boolean }): void;
}

/** Shared scratchpad that lets plugins correlate behaviour (e.g. "copied, then left the tab"). */
export interface TrackerMemory {
  lastAction?: { event: string; element_id?: string; at: number };
  lastCopy?: { field: string; detected_type: string; at: number };
  pageViewStartedAt: number;
  /** Page scroll stats for the current page view, maintained by the scroll plugin. */
  scroll?: { maxPct: number; reversals: number; distancePx: number };
}

export interface Plugin {
  name: string;
  setup(tracker: TrackerApi): void | (() => void);
  /** Emit pending summaries (exposure, engagement…). `reason` lands on the summary events. */
  flush?(reason: FlushReason): void;
  /** A new page view started (SPA route change). Reset per-page state. */
  onPage?(): void;
}

export type FlushReason = 'hidden' | 'pagehide' | 'route_change' | 'interval' | 'manual';

export interface TrackerConfig {
  zone: string;
  appVersion?: string;
  /** Base URL of the local collector, e.g. `http://localhost:3000/api`. */
  collectorUrl: string;
  segment?: {
    /** Real Segment write key. When absent the Segment SDK is pointed at the local Segment-compatible collector. */
    writeKey?: string;
    /** Also mirror events to the local collector when a real write key is set. */
    mirrorToLocal?: boolean;
  };
  newRelic?: {
    licenseKey: string;
    applicationId: string;
    accountId: string;
    trustKey?: string;
    agentId?: string;
    beacon?: string;
  };
  replay?: boolean;
  /** Plugins to enable; defaults to all. */
  plugins?: Plugin[];
  debug?: boolean;
}

export interface TrackerApi {
  readonly config: TrackerConfig;
  readonly memory: TrackerMemory;
  track(event: string, props?: Props): void;
  page(pageType: string, props?: Props): void;
  identify(agent: AgentIdentity): void;
  setInvestigation(input: InvestigationInput | null): void;
  getContext(): CommonContext;
  flush(reason?: FlushReason): void;
  subscribe(listener: (e: TrackedEvent) => void): () => void;
  /** Records an explicit copy action (e.g. a "Copy" button that uses the async clipboard API). */
  copied(text: string, field: string, props?: Props): void;
  isEnabled(): boolean;
}

export interface InvestigationInput {
  orderId: string;
  ticketId?: string | null;
  reason?: string | null;
  orderStatus?: string;
}

export interface TrackedEvent {
  type: 'track' | 'page' | 'identify';
  name: string;
  props: Props;
  at: number;
}
