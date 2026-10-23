'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EventCategory, LineItem, Order } from '@poc/mock-data';
import { EVENTS } from '@poc/tracker';
import { usePageView, useTrack } from '@poc/tracker/react';
import { AddressCard } from './AddressCard';
import { ArtworkPreview } from './ArtworkPreview';
import { EventsPanel, type PanelState } from './EventsPanel';
import { LineItemCard } from './LineItemCard';
import { OrderHeader } from './OrderHeader';
import { OrderTimeline } from './OrderTimeline';

export type OpenPanel = (trigger: string, filter?: EventCategory | 'all', lineItemId?: string | null) => void;

export function OrderDetail({
  order,
  ticketId,
  ticketReason,
  initialPanel,
}: {
  order: Order;
  ticketId: string | null;
  ticketReason: string | null;
  initialPanel: { open: boolean; filter: string } | null;
}) {
  usePageView(
    'order_detail',
    { order_status: order.status, line_item_count: order.lineItems.length, event_count: order.events.length },
    { orderId: order.id, ticketId, reason: ticketReason, orderStatus: order.status },
  );
  const track = useTrack();

  const [panel, setPanel] = useState<PanelState | null>(
    initialPanel?.open ? { filter: (initialPanel.filter as EventCategory | 'all') ?? 'all', lineItemId: null, openedAt: 0, trigger: 'deep_link' } : null,
  );
  const [preview, setPreview] = useState<LineItem | null>(null);

  useEffect(() => {
    // A deep link (e.g. from the helpdesk) opened the panel without a click.
    if (initialPanel?.open) track(EVENTS.EventsPanelOpened.name, { trigger: 'deep_link', filter: initialPanel.filter, line_item_id: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPanel: OpenPanel = useCallback(
    (trigger, filter = 'all', lineItemId = null) => {
      setPanel({ filter, lineItemId, openedAt: Date.now(), trigger });
      track(EVENTS.EventsPanelOpened.name, { trigger, filter, line_item_id: lineItemId });
    },
    [track],
  );

  return (
    <main className="page" data-track-id="order_page" data-track-key={order.id}>
      <div className="crumbs">
        <a href="/">← Order queue</a>
        <span>/</span>
        <span className="mono">{order.id}</span>
        {ticketId && (
          <span className="badge badge-info" title="Opened from a helpdesk ticket">
            ticket {ticketId}
            {ticketReason ? ` · ${ticketReason.replace(/_/g, ' ')}` : ''}
          </span>
        )}
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <OrderHeader order={order} onOpenEvents={openPanel} />
        <OrderTimeline order={order} onOpenEvents={openPanel} />
        <AddressCard order={order} />

        <section className="stack" data-track-section="line_items" style={{ gap: 12 }}>
          <div className="row-between">
            <h2>
              Items <span className="subtle">({order.lineItems.length})</span>
            </h2>
            <span className="subtle">Hover an ETA to see why it changed</span>
          </div>
          {order.lineItems.map((li) => (
            <LineItemCard key={li.id} item={li} order={order} onOpenEvents={openPanel} onPreview={setPreview} />
          ))}
        </section>
      </div>

      {panel && <EventsPanel order={order} state={panel} onChange={setPanel} onClose={() => setPanel(null)} />}
      {preview && <ArtworkPreview item={preview} onClose={() => setPreview(null)} />}
    </main>
  );
}
