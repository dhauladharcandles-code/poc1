'use client';

import type { Address, Order } from '@poc/mock-data';
import { CopyButton } from './CopyButton';

function oneLine(a: Address) {
  return [a.name, a.line1, a.line2, `${a.city}, ${a.region} ${a.postalCode}`, a.country].filter(Boolean).join(', ');
}

function AddressBlock({ a, field }: { a: Address; field: string }) {
  return (
    <address className="addr" data-pii data-track-field={field}>
      <div style={{ fontWeight: 600 }}>{a.name}</div>
      <div>{a.line1}</div>
      {a.line2 && <div>{a.line2}</div>}
      <div>
        {a.city}, {a.region} <span data-track-field="postal_code">{a.postalCode}</span>
      </div>
      <div>{a.country}</div>
      {a.phone && <div className="muted">{a.phone}</div>}
    </address>
  );
}

export function AddressCard({ order }: { order: Order }) {
  const exception = order.lineItems.some((li) => li.shipment?.status === 'exception');
  const sameStreet = order.shippingAddress.line1 === order.billingAddress.line1;
  const zipMismatch = sameStreet && order.shippingAddress.postalCode !== order.billingAddress.postalCode;

  return (
    <section className="card" data-track-id="address_card" data-track-section="address">
      <div className="card-header">
        <h2>Addresses</h2>
      </div>
      <div className="card-body stack">
        {(exception || zipMismatch) && (
          <div className="banner banner-warn" data-track-id="address_card.warning">
            {exception ? 'Carrier could not deliver to this address. ' : ''}
            {zipMismatch ? 'Shipping and billing ZIP codes differ for the same street.' : ''}
          </div>
        )}
        <div className="addr-grid">
          <div data-track-id="address_card.shipping">
            <div className="row-between">
              <div className="section-title">Ship to</div>
              <CopyButton text={oneLine(order.shippingAddress)} field="shipping_address" trackId="copy.shipping_address" pii />
            </div>
            <AddressBlock a={order.shippingAddress} field="shipping_address" />
          </div>
          <div data-track-id="address_card.billing">
            <div className="row-between">
              <div className="section-title">Bill to</div>
            </div>
            <AddressBlock a={order.billingAddress} field="billing_address" />
          </div>
        </div>
      </div>
    </section>
  );
}
