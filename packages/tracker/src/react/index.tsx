'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { configFromEnv, createAgentTracker, type AgentTracker } from '../index';
import { EVENTS } from '../tracking-plan';
import type { AgentIdentity, InvestigationInput, Props, TrackedEvent } from '../types';

export { TrackerInspector } from './inspector';

const TrackerContext = createContext<AgentTracker | null>(null);

/** Read once per bundle; Next.js inlines these at build time. */
function envConfig(zone: string) {
  return configFromEnv(zone, {
    NEXT_PUBLIC_COLLECTOR_URL: process.env.NEXT_PUBLIC_COLLECTOR_URL,
    NEXT_PUBLIC_SEGMENT_WRITE_KEY: process.env.NEXT_PUBLIC_SEGMENT_WRITE_KEY,
    NEXT_PUBLIC_SEGMENT_MIRROR_LOCAL: process.env.NEXT_PUBLIC_SEGMENT_MIRROR_LOCAL,
    NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY: process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY,
    NEXT_PUBLIC_NEW_RELIC_APPLICATION_ID: process.env.NEXT_PUBLIC_NEW_RELIC_APPLICATION_ID,
    NEXT_PUBLIC_NEW_RELIC_ACCOUNT_ID: process.env.NEXT_PUBLIC_NEW_RELIC_ACCOUNT_ID,
    NEXT_PUBLIC_NEW_RELIC_TRUST_KEY: process.env.NEXT_PUBLIC_NEW_RELIC_TRUST_KEY,
    NEXT_PUBLIC_NEW_RELIC_AGENT_ID: process.env.NEXT_PUBLIC_NEW_RELIC_AGENT_ID,
    NEXT_PUBLIC_REPLAY: process.env.NEXT_PUBLIC_REPLAY,
    NEXT_PUBLIC_TRACKER_DEBUG: process.env.NEXT_PUBLIC_TRACKER_DEBUG,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
  });
}

export const AGENT_STORAGE_KEY = 'poc.agent';

export function readStoredAgent(): AgentIdentity | null {
  try {
    const raw = localStorage.getItem(AGENT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AgentIdentity) : null;
  } catch {
    return null;
  }
}

/**
 * Mount once per zone, in the root layout. Every micro frontend gets the same tracker
 * behaviour and the same ids (session, tab, investigation) via shared storage.
 */
export function TrackerProvider({ zone, children }: { zone: string; children: ReactNode }) {
  const [tracker, setTracker] = useState<AgentTracker | null>(null);

  useEffect(() => {
    const t = createAgentTracker(envConfig(zone));
    const agent = readStoredAgent();
    if (agent) t.identify(agent);
    setTracker(t);
  }, [zone]);

  return <TrackerContext.Provider value={tracker}>{children}</TrackerContext.Provider>;
}

export function useTracker(): AgentTracker | null {
  return useContext(TrackerContext);
}

/** Stable `track` that buffers calls made before the tracker exists. */
export function useTrack() {
  const tracker = useTracker();
  const ref = useRef(tracker);
  ref.current = tracker;
  const pending = useRef<[string, Props | undefined][]>([]);
  useEffect(() => {
    if (!tracker) return;
    for (const [e, p] of pending.current.splice(0)) tracker.track(e, p);
  }, [tracker]);
  const fn = useRef((event: string, props?: Props) => {
    if (ref.current) ref.current.track(event, props);
    else pending.current.push([event, props]);
  });
  return fn.current;
}

/** Fires a Segment page() for this route. Investigation must be set before, so it is passed in here. */
export function usePageView(pageType: string, props: Props = {}, investigation?: InvestigationInput | null) {
  const tracker = useTracker();
  const key = JSON.stringify([pageType, props, investigation]);
  useEffect(() => {
    if (!tracker) return;
    tracker.setInvestigation(investigation ?? null);
    tracker.page(pageType, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracker, key]);
}

/** `Empty State Shown`, once per mount while `shown` is true. */
export function useEmptyState(shown: boolean, elementId: string, reason: string, props: Props = {}) {
  const track = useTrack();
  const fired = useRef(false);
  useEffect(() => {
    if (shown && !fired.current) {
      fired.current = true;
      track(EVENTS.EmptyStateShown.name, { element_id: elementId, reason, ...props });
    }
    if (!shown) fired.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, elementId, reason]);
}

/** Live feed of events for the on-page inspector. */
export function useTrackedEvents(limit = 150): TrackedEvent[] {
  const tracker = useTracker();
  const [events, setEvents] = useState<TrackedEvent[]>([]);
  useEffect(() => {
    if (!tracker) return;
    return tracker.subscribe((e) => setEvents((prev) => [e, ...prev].slice(0, limit)));
  }, [tracker, limit]);
  return events;
}
