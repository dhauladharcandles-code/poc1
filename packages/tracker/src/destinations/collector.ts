import { uuid } from '../ids';
import type { AgentIdentity, Destination, Props } from '../types';

/**
 * Minimal first-party transport that speaks Segment's batch format. Used to mirror events
 * to the local collector when a real Segment write key is configured.
 */
export function collectorDestination(collectorUrl: string): Destination {
  let queue: Record<string, unknown>[] = [];
  let userId: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function context() {
    return {
      library: { name: 'poc-tracker', version: '0.1.0' },
      page: { path: location.pathname, url: location.href, referrer: document.referrer, title: document.title },
      userAgent: navigator.userAgent,
    };
  }

  function push(msg: Record<string, unknown>) {
    queue.push({ messageId: uuid(), timestamp: new Date().toISOString(), userId, context: context(), ...msg });
    if (queue.length >= 25) send(false);
    else if (!timer) timer = setTimeout(() => send(false), 2_000);
  }

  function send(unloading: boolean) {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!queue.length) return;
    const body = JSON.stringify({ batch: queue, sentAt: new Date().toISOString() });
    queue = [];
    void fetch(`${collectorUrl}/segment/v1/b`, { method: 'POST', body, keepalive: unloading && body.length < 60_000 }).catch(() => undefined);
  }

  return {
    name: 'collector',
    track: (event: string, properties: Props) => push({ type: 'track', event, properties }),
    page: (name: string, properties: Props) => push({ type: 'page', name, properties }),
    identify: (agent: AgentIdentity) => {
      userId = agent.id;
      const { id, ...traits } = agent;
      push({ type: 'identify', userId: id, traits });
    },
    flush: ({ unloading }) => send(unloading),
  };
}
