import type { FlushReason, Plugin, TrackerApi } from '../types';

export interface ReplayOptions {
  /** Upload cadence for recorded chunks. */
  flushEveryMs?: number;
}

/**
 * Open-source session replay with rrweb — the stand-in for New Relic Session Replay while there are no keys.
 * PII is masked at the source: every `[data-pii]` text node and every input value is replaced before it is recorded.
 */
export function replayPlugin(opts: ReplayOptions = {}): Plugin {
  const flushEveryMs = opts.flushEveryMs ?? 5_000;
  let tracker: TrackerApi;
  let buffer: unknown[] = [];
  let chunkSeq = 0;
  let stop: (() => void) | undefined;
  let stopped = false;

  function upload(unloading: boolean) {
    if (!buffer.length) return;
    const ctx = tracker.getContext();
    const body = JSON.stringify({
      replay_id: ctx.replay_id,
      session_id: ctx.session_id,
      tab_id: ctx.tab_id,
      zone: ctx.zone,
      chunk_seq: chunkSeq++,
      events: buffer,
    });
    buffer = [];
    // keepalive requests are capped at 64KB; bigger chunks go as a normal request and may be lost on unload.
    void fetch(`${tracker.config.collectorUrl}/replay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: unloading && body.length < 60_000,
    }).catch(() => undefined);
  }

  return {
    name: 'replay',
    setup(t) {
      tracker = t;
      void import('@rrweb/record').then(({ record }) => {
        if (stopped) return;
        stop =
          record({
            emit(event) {
              buffer.push(event);
            },
            maskAllInputs: true,
            maskTextSelector: '[data-pii]',
            blockSelector: '[data-track-ignore]',
            inlineStylesheet: true,
            slimDOMOptions: 'all',
            sampling: { mousemove: 50, scroll: 150, input: 'last' },
          }) ?? undefined;
      });
      const timer = setInterval(() => upload(false), flushEveryMs);
      return () => {
        stopped = true;
        clearInterval(timer);
        stop?.();
        upload(true);
      };
    },
    flush(reason: FlushReason) {
      upload(reason === 'hidden' || reason === 'pagehide');
    },
  };
}
