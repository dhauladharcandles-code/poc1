'use client';

import { useEffect, useState } from 'react';

interface LiveRow {
  ts: string;
  received_at: string;
  event: string;
  agent_id: string | null;
  zone: string | null;
  page_type: string | null;
  order_id: string | null;
  element_id: string | null;
  properties: string;
}

const HIDE = ['session_id', 'tab_id', 'page_view_id', 'replay_id', 'zone', 'page_type', 'investigation_id', 'order_id', 'ticket_id', 'entry_point', 'app_version', 'seq'];

export function LiveFeed() {
  const [rows, setRows] = useState<LiveRow[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (paused) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/insights/api/live', { cache: 'no-store' });
        if (alive && res.ok) setRows(await res.json());
      } catch {
        /* collector restarting */
      }
    };
    void load();
    const t = setInterval(load, 2_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [paused]);

  const shown = rows.filter((r) => !filter || r.event.toLowerCase().includes(filter.toLowerCase()) || (r.element_id ?? '').includes(filter));
  return (
    <div className="stack">
      <div className="row">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Filter by event or element…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="btn" onClick={() => setPaused((p) => !p)}>
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <span className="subtle">{shown.length} events</span>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Client time</th>
              <th>Event</th>
              <th>Agent</th>
              <th>Page</th>
              <th>Order</th>
              <th>Properties</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              let p: Record<string, unknown> = {};
              try {
                p = JSON.parse(r.properties ?? '{}');
              } catch {
                /* ignore */
              }
              const rest = Object.entries(p)
                .filter(([k, v]) => !HIDE.includes(k) && v !== null && v !== undefined)
                .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v)}`)
                .join('  ');
              return (
                <tr key={i}>
                  <td className="mono subtle">{new Date(r.ts).toLocaleTimeString()}</td>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.event}</td>
                  <td className="mono">{r.agent_id ?? '—'}</td>
                  <td>{r.zone}/{r.page_type}</td>
                  <td className="mono">{r.order_id ?? '—'}</td>
                  <td className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)', maxWidth: 640, wordBreak: 'break-word' }}>{rest}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
