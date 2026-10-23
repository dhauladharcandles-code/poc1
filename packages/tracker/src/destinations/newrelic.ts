import type { AgentIdentity, Destination, Props, TrackerConfig } from '../types';

type NewRelicConfig = NonNullable<TrackerConfig['newRelic']>;

interface NrAgent {
  addPageAction(name: string, attributes?: Record<string, string | number | boolean>): void;
  setCustomAttribute(name: string, value: string | number | boolean | null, persist?: boolean): void;
  setUserId(id: string | null): void;
}

/**
 * New Relic Browser with Session Replay. Only loaded when keys are configured.
 * Every tracker event becomes a PageAction, and the ids that join to Snowflake
 * (session, investigation, order, replay) are set as custom attributes so a
 * Snowflake row can be looked up in New Relic and vice versa.
 *
 * Not exercised in the POC (no keys) — verify against your account before relying on it.
 */
export function newRelicDestination(cfg: NewRelicConfig): Destination {
  let agent: NrAgent | null = null;
  const pending: ((a: NrAgent) => void)[] = [];
  const run = (fn: (a: NrAgent) => void) => (agent ? fn(agent) : pending.push(fn));
  const JOIN_KEYS = ['session_id', 'tab_id', 'investigation_id', 'order_id', 'replay_id', 'ticket_id'];

  function flatten(props: Props): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
      else out[k] = JSON.stringify(v).slice(0, 4_000);
    }
    return out;
  }

  return {
    name: 'newrelic',
    async init() {
      const { BrowserAgent } = await import('@newrelic/browser-agent/loaders/browser-agent');
      const beacon = cfg.beacon ?? 'bam.nr-data.net';
      agent = new BrowserAgent({
        init: {
          session_replay: {
            enabled: true,
            sampling_rate: 100,
            error_sampling_rate: 100,
            mask_all_inputs: true,
            mask_text_selector: '[data-pii]',
            block_selector: '[data-track-ignore]',
          },
          privacy: { cookies_enabled: true },
          distributed_tracing: { enabled: false },
        },
        info: { beacon, errorBeacon: beacon, licenseKey: cfg.licenseKey, applicationID: cfg.applicationId, sa: 1 },
        loader_config: {
          accountID: cfg.accountId,
          trustKey: cfg.trustKey ?? cfg.accountId,
          agentID: cfg.agentId ?? cfg.applicationId,
          licenseKey: cfg.licenseKey,
          applicationID: cfg.applicationId,
        },
      } as never) as unknown as NrAgent;
      for (const fn of pending.splice(0)) fn(agent);
    },
    track(event, props) {
      run((a) => {
        for (const k of JOIN_KEYS) if (k in props) a.setCustomAttribute(k, (props[k] as string) ?? null, true);
        a.addPageAction(event, flatten(props));
      });
    },
    page(name, props) {
      run((a) => a.addPageAction('Page Viewed', flatten({ ...props, page_type: name })));
    },
    identify(id: AgentIdentity) {
      run((a) => {
        a.setUserId(id.id);
        if (id.team) a.setCustomAttribute('agent_team', id.team, true);
      });
    },
  };
}
