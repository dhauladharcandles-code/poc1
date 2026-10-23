import type { AnalyticsBrowser } from '@segment/analytics-next';
import type { AgentIdentity, Destination, Props } from '../types';

export interface SegmentDestinationOptions {
  /** Real write key. Without it, the Segment SDK posts to the local Segment-compatible collector. */
  writeKey?: string;
  collectorUrl: string;
  zone: string;
}

/**
 * Uses the real Segment SDK (@segment/analytics-next) in both modes:
 *  - with a write key → api.segment.io as usual (then Segment → Snowflake)
 *  - without → `cdnSettings` is inlined and the Segment.io destination's apiHost points at our collector
 * so switching to production is purely configuration.
 */
export function segmentDestination(opts: SegmentDestinationOptions): Destination {
  let analytics: AnalyticsBrowser | null = null;
  const pending: ((a: AnalyticsBrowser) => void)[] = [];

  const run = (fn: (a: AnalyticsBrowser) => void) => (analytics ? fn(analytics) : pending.push(fn));

  return {
    name: 'segment',
    async init() {
      const { AnalyticsBrowser } = await import('@segment/analytics-next');
      const local = !opts.writeKey;
      const writeKey = opts.writeKey ?? 'local-poc';
      const batching = { strategy: 'batching', config: { size: 25, timeout: 2_000 } };
      let segmentIo: Record<string, unknown> = { deliveryStrategy: batching };
      if (local) {
        const u = new URL(opts.collectorUrl, location.href);
        segmentIo = {
          ...segmentIo,
          apiHost: `${u.host}${u.pathname.replace(/\/$/, '')}/segment/v1`,
          protocol: u.protocol.replace(':', ''),
        };
      }
      analytics = AnalyticsBrowser.load(
        local
          ? // Skip the CDN settings fetch entirely in local mode.
            { writeKey, cdnSettings: { integrations: { 'Segment.io': { apiKey: writeKey } } } as never }
          : { writeKey },
        { integrations: { 'Segment.io': segmentIo as never } },
      );
      for (const fn of pending.splice(0)) fn(analytics);
    },
    track(event: string, props: Props) {
      run((a) => void a.track(event, props));
    },
    page(name: string, props: Props) {
      run((a) => void a.page(opts.zone, name, props));
    },
    identify(agent: AgentIdentity) {
      const { id, ...traits } = agent;
      run((a) => void a.identify(id, traits));
    },
  };
}
