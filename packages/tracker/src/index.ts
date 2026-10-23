import { createTracker } from './core';
import { collectorDestination } from './destinations/collector';
import { newRelicDestination } from './destinations/newrelic';
import { segmentDestination } from './destinations/segment';
import { attentionPlugin } from './plugins/attention';
import { clicksPlugin } from './plugins/clicks';
import { clipboardPlugin } from './plugins/clipboard';
import { errorsPlugin, keyboardPlugin } from './plugins/misc';
import { replayPlugin } from './plugins/replay';
import { scrollPlugin } from './plugins/scroll';
import { viewabilityPlugin } from './plugins/viewability';
import type { Destination, TrackerApi, TrackerConfig } from './types';

export * from './types';
export * from './tracking-plan';
export { createTracker } from './core';
export { classifyEntry } from './ids';
export { detectType, hashText } from './dom';
export { attentionPlugin, clicksPlugin, clipboardPlugin, keyboardPlugin, errorsPlugin, replayPlugin, scrollPlugin, viewabilityPlugin };
export { segmentDestination, newRelicDestination, collectorDestination };

export type AgentTracker = TrackerApi & { shutdown(): void };

const GLOBAL_KEY = '__pocAgentTracker';

/**
 * Builds the tracker every zone uses. One instance per document (kept on `window`
 * so React Fast Refresh and remounts don't double-subscribe listeners).
 */
export function createAgentTracker(config: TrackerConfig): AgentTracker {
  const w = window as unknown as Record<string, AgentTracker | undefined>;
  const existing = w[GLOBAL_KEY];
  if (existing) return existing;

  // Heatmap previews embed pages in iframes — those must not generate analytics.
  const disabled = window.top !== window.self || new URLSearchParams(location.search).has('__no_track');

  const destinations: Destination[] = [segmentDestination({ writeKey: config.segment?.writeKey, collectorUrl: config.collectorUrl, zone: config.zone })];
  if (config.segment?.writeKey && config.segment.mirrorToLocal) destinations.push(collectorDestination(config.collectorUrl));
  if (config.newRelic?.licenseKey) destinations.push(newRelicDestination(config.newRelic));

  const plugins = config.plugins ?? [
    attentionPlugin(),
    viewabilityPlugin(),
    scrollPlugin(),
    clicksPlugin(),
    clipboardPlugin(),
    keyboardPlugin(),
    errorsPlugin(),
    ...(config.replay === false ? [] : [replayPlugin()]),
  ];

  const tracker = createTracker({ config, destinations, plugins, disabled });
  w[GLOBAL_KEY] = tracker;
  return tracker;
}

/** Reads tracker config from NEXT_PUBLIC_* env (inlined at build time by Next.js). */
export function configFromEnv(zone: string, env: Record<string, string | undefined>): TrackerConfig {
  const collector = env.NEXT_PUBLIC_COLLECTOR_URL || `${typeof location !== 'undefined' ? location.origin : ''}/api`;
  const nrKey = env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY;
  return {
    zone,
    appVersion: env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0',
    collectorUrl: collector,
    segment: { writeKey: env.NEXT_PUBLIC_SEGMENT_WRITE_KEY || undefined, mirrorToLocal: env.NEXT_PUBLIC_SEGMENT_MIRROR_LOCAL === 'true' },
    newRelic: nrKey
      ? {
          licenseKey: nrKey,
          applicationId: env.NEXT_PUBLIC_NEW_RELIC_APPLICATION_ID ?? '',
          accountId: env.NEXT_PUBLIC_NEW_RELIC_ACCOUNT_ID ?? '',
          trustKey: env.NEXT_PUBLIC_NEW_RELIC_TRUST_KEY,
          agentId: env.NEXT_PUBLIC_NEW_RELIC_AGENT_ID,
        }
      : undefined,
    replay: env.NEXT_PUBLIC_REPLAY !== 'off',
    debug: env.NEXT_PUBLIC_TRACKER_DEBUG === 'true',
  };
}
