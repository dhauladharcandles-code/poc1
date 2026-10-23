'use client';

import { useState } from 'react';
import { fmtDateTime, fmtMoney, type Order } from '@poc/mock-data';
import { EVENTS } from '@poc/tracker';
import { useTrack } from '@poc/tracker/react';
import { Badge, StatusBadge } from '@poc/ui';
import { CopyButton } from './CopyButton';
import type { OpenPanel } from './OrderDetail';

export function OrderHeader({ order, onOpenEvents }: { order: Order; onOpenEvents: OpenPanel }) {
  const track = useTrack();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const latest = order.events[0];
  const t = order.totals;

  function toggleBreakdown() {
    if (!showBreakdown) track(EVENTS.OrderTotalsExpanded.name, {});
    setShowBreakdown((v) => !v);
  }

  return (
    <section className="card" data-track-id="order_header" data-track-section="header">
      <div className="order-head">
        <div>
          <div className="id-row">
            <h1 className="mono" data-track-field="order_id" style={{ fontSize: 22 }}>
              {order.id}
            </h1>
            <CopyButton text={order.id} field="order_id" />
            <StatusBadge status={order.status} />
            <Badge>{order.channel}</Badge>
          </div>
          <div className="facts">
            <span>
              Placed <b>{fmtDateTime(order.placedAt)}</b>
            </span>
            <span>
              Customer{' '}
              <b data-pii data-track-field="customer_name">
                {order.customer.name}
              </b>{' '}
              <Badge tone={order.customer.tier === 'business' ? 'accent' : order.customer.tier === 'plus' ? 'info' : 'neutral'}>{order.customer.tier}</Badge>
            </span>
            <span data-pii data-track-field="customer_email">
              {order.customer.email}
            </span>
          </div>
        </div>
        <div className="order-total" data-track-id="order_header.total">
          <div className="subtle">Order total</div>
          <div className="amount" data-track-field="order_total">
            {fmtMoney(t.total)}
          </div>
          <button className="btn btn-sm btn-ghost" onClick={toggleBreakdown} data-track-id="order_header.breakdown_toggle">
            {showBreakdown ? 'Hide breakdown ▴' : 'Price breakdown ▾'}
          </button>
          {showBreakdown && (
            <div className="breakdown" data-track-id="order_header.breakdown">
              <span>Subtotal</span>
              <span className="v">{fmtMoney(t.subtotal)}</span>
              <span>Shipping</span>
              <span className="v">{fmtMoney(t.shipping)}</span>
              {t.discount > 0 && (
                <>
                  <span>Discount</span>
                  <span className="v">−{fmtMoney(t.discount)}</span>
                </>
              )}
              <span>Tax</span>
              <span className="v">{fmtMoney(t.tax)}</span>
              <span>Payment</span>
              <span className="v">
                {order.payment.method} · {order.payment.status}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="latest" data-track-id="order_header.latest_update">
        <Badge tone={latest.severity === 'error' ? 'err' : latest.severity === 'warning' ? 'warn' : 'neutral'}>Latest</Badge>
        <span>
          <b>{latest.title}</b> · <span className="muted">{fmtDateTime(latest.at)}</span>
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={() => onOpenEvents('latest_update', 'all')} data-track-id="order_header.view_events">
          View all {order.events.length} events →
        </button>
      </div>
    </section>
  );
}
