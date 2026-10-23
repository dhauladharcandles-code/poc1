'use client';

import { useMemo, useRef, useState } from 'react';
import { fmtDate, fmtMoney, type OrderSummary } from '@poc/mock-data';
import { EVENTS, detectType } from '@poc/tracker';
import { usePageView, useTrack } from '@poc/tracker/react';
import { Badge, StatusBadge } from '@poc/ui';

/** Simulated helpdesk tickets: deep links carry ticket id + reason, like a Zendesk sidebar app would. */
const TICKETS = [
  { id: 'T-48213', order: 'ORD-10482', reason: 'wismo', subject: 'Where is my order? It was due yesterday', channel: 'chat' },
  { id: 'T-48217', order: 'ORD-10491', reason: 'missing_items', subject: 'Only got part of my order', channel: 'email' },
  { id: 'T-48222', order: 'ORD-10503', reason: 'order_delay', subject: 'Why hasn’t my order shipped?', channel: 'phone' },
  { id: 'T-48230', order: 'ORD-10517', reason: 'address_change', subject: 'FedEx says my address is wrong', channel: 'chat' },
  { id: 'T-48236', order: 'ORD-10529', reason: 'not_received', subject: 'Says delivered, nothing arrived', channel: 'email' },
];

export function OrderQueue({ orders }: { orders: OrderSummary[] }) {
  usePageView('order_queue', { order_count: orders.length });
  const track = useTrack();
  const [q, setQ] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return orders;
    return orders.filter(
      (o) => o.id.toLowerCase().includes(s) || o.customerName.toLowerCase().includes(s) || o.flags.some((f) => f.toLowerCase().includes(s)),
    );
  }, [q, orders]);

  function onSearch(value: string) {
    setQ(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if (!value.trim()) return;
      const s = value.trim().toLowerCase();
      const count = orders.filter((o) => o.id.toLowerCase().includes(s) || o.customerName.toLowerCase().includes(s)).length;
      // The query itself may be a customer name, so only its shape is sent.
      track(EVENTS.OrderSearched.name, { query_type: detectType(value), query_length: value.trim().length, result_count: count });
    }, 600);
  }

  function open(o: OrderSummary, position: number) {
    track(EVENTS.OrderOpened.name, { order_id: o.id, position, from_search: !!q.trim() });
  }

  return (
    <div className="grid-main" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20 }}>
      <section className="stack" data-track-section="queue">
        <div className="row-between">
          <div>
            <h1>Order queue</h1>
            <div className="subtle">Search by order number, customer or flag. Opening an order starts an investigation.</div>
          </div>
        </div>
        <div data-track-id="queue.search" style={{ maxWidth: 420 }}>
          <input
            className="input"
            placeholder="Search ORD-…, customer, flag"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            data-track-field="order_search"
            aria-label="Search orders"
          />
        </div>
        <div className="card" data-track-id="queue.table">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Placed</th>
                <th>Status</th>
                <th className="num">Items</th>
                <th className="num">Total</th>
                <th>Latest ETA</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {results.map((o, i) => (
                <tr key={o.id} data-track-id="queue.row" data-track-key={o.id}>
                  <td>
                    <a href={`/orders/${o.id}?src=${q.trim() ? 'queue_search' : 'queue'}`} onClick={() => open(o, i)} className="mono" data-track-field="order_id">
                      {o.id}
                    </a>
                  </td>
                  <td data-pii>{o.customerName}</td>
                  <td className="muted">{fmtDate(o.placedAt)}</td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="num">{o.itemCount}</td>
                  <td className="num">{fmtMoney(o.total)}</td>
                  <td className="muted">{fmtDate(o.nextEta)}</td>
                  <td>
                    <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                      {o.flags.map((f) => (
                        <Badge key={f} tone={f === 'Carrier exception' || f === 'Artwork blocked' ? 'err' : 'warn'}>
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.length === 0 && (
            <div className="empty">
              <strong>No orders match “{q}”</strong>
              Try the full order number, e.g. ORD-10482.
            </div>
          )}
        </div>
      </section>

      <aside className="stack" data-track-section="tickets">
        <div className="card" data-track-id="helpdesk.tickets">
          <div className="card-header">
            <h2>Open tickets</h2>
            <span className="subtle">simulated helpdesk</span>
          </div>
          <div className="card-body stack" style={{ gap: 10 }}>
            {TICKETS.map((t) => (
              <a
                key={t.id}
                href={`/orders/${t.order}?src=helpdesk&ticket=${t.id}&reason=${t.reason}`}
                className="card"
                style={{ padding: 12, display: 'block', color: 'inherit', textDecoration: 'none', boxShadow: 'none' }}
                data-track-id="helpdesk.ticket"
                data-track-key={t.id}
              >
                <div className="row-between">
                  <span className="mono">{t.id}</span>
                  <Badge tone="info">{t.channel}</Badge>
                </div>
                <div style={{ marginTop: 4, fontWeight: 550 }}>{t.subject}</div>
                <div className="subtle">
                  {t.order} · reason: {t.reason.replace(/_/g, ' ')}
                </div>
              </a>
            ))}
            <div className="subtle">
              Links carry <span className="mono">?src=helpdesk&ticket=…&reason=…</span> — this is how “what problem is the agent solving” gets ground truth.
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
