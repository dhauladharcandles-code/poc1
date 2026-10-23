'use client';

import { useEffect, useRef, useState } from 'react';
import 'rrweb-player/dist/style.css';

export function ReplayPlayer({ replayIds }: { replayIds: string[] }) {
  const [active, setActive] = useState(replayIds[0]);
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading');
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let player: { $destroy?: () => void } | null = null;
    setState('loading');
    (async () => {
      const res = await fetch(`/insights/api/replay/${active}`);
      const events = (await res.json()) as unknown[];
      if (cancelled || !host.current) return;
      if (events.length < 2) {
        setState('empty');
        return;
      }
      const { default: RRWebPlayer } = await import('rrweb-player');
      if (cancelled || !host.current) return;
      host.current.innerHTML = '';
      const width = host.current.clientWidth;
      player = new RRWebPlayer({
        target: host.current,
        props: { events: events as never, width, height: Math.round(width * 0.62), autoPlay: false, skipInactive: true, showController: true },
      }) as unknown as { $destroy?: () => void };
      setState('ready');
    })().catch(() => !cancelled && setState('empty'));
    return () => {
      cancelled = true;
      player?.$destroy?.();
    };
  }, [active]);

  return (
    <div className="stack" style={{ gap: 8 }}>
      {replayIds.length > 1 && (
        <div className="seg" role="group" aria-label="Recording">
          {replayIds.map((id, i) => (
            <button key={id} aria-pressed={active === id} onClick={() => setActive(id)}>
              Page load {i + 1}
            </button>
          ))}
        </div>
      )}
      {state === 'loading' && <div className="subtle">Loading recording…</div>}
      {state === 'empty' && <div className="empty">Recording is too short to replay.</div>}
      <div ref={host} />
    </div>
  );
}
