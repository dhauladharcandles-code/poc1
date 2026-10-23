import type {
  Address,
  Artwork,
  LineItem,
  Milestone,
  MilestoneKey,
  Order,
  OrderEvent,
  OrderSummary,
  Shipment,
} from './types.ts';

/**
 * All dates are generated relative to "today" (UTC, day precision) so the demo
 * always looks fresh. Orders are built on the server and passed to the client
 * as props, so server/client never disagree about the reference date.
 */
function referenceDay(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function at(dayOffset: number, hour = 12, minute = 0): string {
  return new Date(referenceDay() + dayOffset * 86_400_000 + (hour * 60 + minute) * 60_000).toISOString();
}

const MILESTONES: { key: MilestoneKey; label: string }[] = [
  { key: 'placed', label: 'Order placed' },
  { key: 'paid', label: 'Payment captured' },
  { key: 'artwork_approved', label: 'Artwork approved' },
  { key: 'in_production', label: 'In production' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

function milestones(
  reached: Partial<Record<MilestoneKey, string>>,
  current: MilestoneKey,
  blocked?: MilestoneKey,
): Milestone[] {
  const currentIdx = MILESTONES.findIndex((m) => m.key === current);
  return MILESTONES.map((m, i) => ({
    ...m,
    at: reached[m.key],
    state:
      m.key === blocked ? 'blocked' : i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'upcoming',
  }));
}

function trackingUrl(carrier: Shipment['carrier'], tn: string): string {
  switch (carrier) {
    case 'UPS':
      return `https://www.ups.com/track?tracknum=${tn}`;
    case 'FedEx':
      return `https://www.fedex.com/fedextrack/?trknbr=${tn}`;
    case 'USPS':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tn}`;
    case 'DHL':
      return `https://www.dhl.com/en/express/tracking.html?AWB=${tn}`;
  }
}

function shipment(id: string, carrier: Shipment['carrier'], tn: string, s: Omit<Shipment, 'id' | 'carrier' | 'trackingNumber' | 'trackingUrl'>): Shipment {
  return { id, carrier, trackingNumber: tn, trackingUrl: trackingUrl(carrier, tn), ...s };
}

function artwork(id: string, name: string, motif: Artwork['motif'], palette: string[], extra: Partial<Artwork> = {}): Artwork {
  return { id, name, motif, palette, version: 1, status: 'approved', dpi: 300, ...extra };
}

function addr(a: Address): Address {
  return a;
}

let eventSeq = 0;
function ev(e: Omit<OrderEvent, 'id'>): OrderEvent {
  eventSeq += 1;
  return { id: `evt_${eventSeq.toString().padStart(4, '0')}`, ...e };
}

function totals(items: LineItem[], shipping: number, discount = 0) {
  const subtotal = round(items.reduce((s, li) => s + li.unitPrice * li.quantity, 0));
  const tax = round((subtotal - discount) * 0.0825);
  return { subtotal, shipping, tax, discount, total: round(subtotal + shipping + tax - discount), currency: 'USD' as const };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function buildOrders(): Order[] {
  eventSeq = 0;
  const orders: Order[] = [];

  // 1. Classic "where is my order": shipped, in transit, ETA slipped by a day.
  {
    const items: LineItem[] = [
      {
        id: 'li_10482_1',
        sku: 'MUG-11OZ-WHT',
        name: 'Ceramic Mug 11oz',
        productType: 'mug',
        options: { Color: 'White', Finish: 'Gloss' },
        quantity: 2,
        unitPrice: 18.5,
        artwork: artwork('art_771', 'Himalayan Sunrise', 'mountain', ['#1d3557', '#e76f51', '#f4a261', '#fefae0']),
        production: { status: 'done', facility: 'Austin, TX' },
        eta: { promised: at(-1, 20), current: at(1, 20), confidence: 'medium', reason: 'Carrier delay at regional hub' },
        shipment: shipment('shp_10482_a', 'UPS', '1Z999AA10123456784', {
          status: 'in_transit',
          lastScan: { at: at(-1, 6, 42), location: 'Hodgkins, IL', description: 'Delay: weather at facility' },
        }),
      },
      {
        id: 'li_10482_2',
        sku: 'TEE-UNI-M-NVY',
        name: 'Unisex Tee',
        productType: 'tshirt',
        options: { Size: 'M', Color: 'Navy' },
        quantity: 1,
        unitPrice: 24,
        artwork: artwork('art_772', 'Trail Lines', 'grid', ['#264653', '#2a9d8f', '#e9c46a']),
        production: { status: 'done', facility: 'Austin, TX' },
        eta: { promised: at(-1, 20), current: at(1, 20), confidence: 'medium', reason: 'Ships in the same box as Ceramic Mug' },
        shipment: shipment('shp_10482_a', 'UPS', '1Z999AA10123456784', {
          status: 'in_transit',
          lastScan: { at: at(-1, 6, 42), location: 'Hodgkins, IL', description: 'Delay: weather at facility' },
        }),
      },
    ];
    orders.push({
      id: 'ORD-10482',
      placedAt: at(-6, 14, 12),
      status: 'shipped',
      channel: 'web',
      scenario: 'wismo',
      customer: { id: 'cus_201', name: 'Maya Thompson', email: 'maya.t@example.com', tier: 'plus' },
      shippingAddress: addr({ name: 'Maya Thompson', line1: '4417 Cedar Hollow Rd', city: 'Madison', region: 'WI', postalCode: '53711', country: 'US', phone: '+1 608 555 0143' }),
      billingAddress: addr({ name: 'Maya Thompson', line1: '4417 Cedar Hollow Rd', city: 'Madison', region: 'WI', postalCode: '53711', country: 'US' }),
      totals: totals(items, 7.99),
      payment: { method: 'Visa •••• 4242', status: 'captured' },
      milestones: milestones(
        { placed: at(-6, 14, 12), paid: at(-6, 14, 13), artwork_approved: at(-6, 16), in_production: at(-5, 9), shipped: at(-3, 17, 30) },
        'out_for_delivery',
      ),
      lineItems: items,
      events: [
        ev({ at: at(-6, 14, 12), category: 'order', title: 'Order placed', description: 'Order created on web storefront.', actor: 'customer', severity: 'info' }),
        ev({ at: at(-6, 14, 13), category: 'payment', title: 'Payment captured', description: 'Visa •••• 4242 charged in full.', actor: 'system', severity: 'info' }),
        ev({ at: at(-6, 16), category: 'artwork', title: 'Artwork auto-approved', description: 'Both artworks passed preflight (300 DPI, CMYK safe).', actor: 'system', severity: 'info' }),
        ev({ at: at(-5, 9), category: 'production', title: 'Sent to production', description: 'Routed to Austin, TX facility.', actor: 'facility', severity: 'info' }),
        ev({ at: at(-4, 15), category: 'production', title: 'Quality check passed', description: 'Print alignment and color within tolerance.', actor: 'facility', severity: 'info', lineItemId: 'li_10482_1' }),
        ev({ at: at(-4, 15, 20), category: 'production', title: 'Quality check passed', description: 'Print alignment and color within tolerance.', actor: 'facility', severity: 'info', lineItemId: 'li_10482_2' }),
        ev({ at: at(-3, 17, 30), category: 'shipping', title: 'Label created', description: 'UPS Ground label 1Z999AA10123456784.', actor: 'system', severity: 'info' }),
        ev({ at: at(-3, 21, 5), category: 'shipping', title: 'Picked up by carrier', description: 'Austin, TX', actor: 'carrier', severity: 'info' }),
        ev({ at: at(-2, 4, 11), category: 'shipping', title: 'Departed facility', description: 'Dallas, TX', actor: 'carrier', severity: 'info' }),
        ev({ at: at(-1, 6, 42), category: 'shipping', title: 'Delay: weather at facility', description: 'Hodgkins, IL — package will move as soon as conditions permit.', actor: 'carrier', severity: 'warning' }),
        ev({ at: at(-1, 7), category: 'order', title: 'ETA updated', description: 'Estimated delivery moved by 2 days.', actor: 'system', severity: 'warning', meta: { previous_eta_days: -1, new_eta_days: 1 } }),
        ev({ at: at(0, 9, 15), category: 'support', title: 'Customer contacted support', description: 'Chat: "My order was supposed to arrive yesterday. Where is it?"', actor: 'customer', severity: 'info' }),
      ],
    });
  }

  // 2. Split shipment: one item delivered, one still in production.
  {
    const items: LineItem[] = [
      {
        id: 'li_10491_1',
        sku: 'PST-18X24-MAT',
        name: 'Matte Poster 18×24',
        productType: 'poster',
        options: { Paper: 'Matte 200gsm', Orientation: 'Portrait' },
        quantity: 1,
        unitPrice: 32,
        artwork: artwork('art_801', 'Monsoon Waves', 'waves', ['#03045e', '#0077b6', '#90e0ef', '#caf0f8']),
        production: { status: 'done', facility: 'Reno, NV' },
        eta: { promised: at(-2, 20), current: at(-2, 20), confidence: 'high' },
        shipment: shipment('shp_10491_a', 'USPS', '9400111899223344556677', {
          status: 'delivered',
          lastScan: { at: at(-2, 13, 27), location: 'Portland, OR', description: 'Delivered, front door' },
        }),
      },
      {
        id: 'li_10491_2',
        sku: 'CND-8OZ-AMB',
        name: 'Custom Label Candle 8oz',
        productType: 'candle',
        options: { Scent: 'Cedar & Pine', Jar: 'Amber' },
        quantity: 3,
        unitPrice: 22,
        artwork: artwork('art_802', 'Dhauladhar Ridge', 'mountain', ['#283618', '#606c38', '#dda15e', '#fefae0']),
        production: { status: 'printing', facility: 'Reno, NV' },
        eta: { promised: at(1, 20), current: at(4, 20), confidence: 'low', reason: 'Wax pour backlog; label reprint queued' },
      },
    ];
    orders.push({
      id: 'ORD-10491',
      placedAt: at(-7, 10, 3),
      status: 'partially_shipped',
      channel: 'web',
      scenario: 'split_shipment',
      customer: { id: 'cus_318', name: 'Daniel Okafor', email: 'd.okafor@example.com', tier: 'standard' },
      shippingAddress: addr({ name: 'Daniel Okafor', line1: '88 NW Raleigh St', line2: 'Apt 5C', city: 'Portland', region: 'OR', postalCode: '97209', country: 'US' }),
      billingAddress: addr({ name: 'Daniel Okafor', line1: '88 NW Raleigh St', line2: 'Apt 5C', city: 'Portland', region: 'OR', postalCode: '97209', country: 'US' }),
      totals: totals(items, 0, 10),
      payment: { method: 'Mastercard •••• 5100', status: 'captured' },
      milestones: milestones(
        { placed: at(-7, 10, 3), paid: at(-7, 10, 4), artwork_approved: at(-7, 15), in_production: at(-6, 8), shipped: at(-4, 16) },
        'shipped',
      ),
      lineItems: items,
      events: [
        ev({ at: at(-7, 10, 3), category: 'order', title: 'Order placed', description: 'Promo code MONSOON10 applied (−$10.00).', actor: 'customer', severity: 'info' }),
        ev({ at: at(-7, 10, 4), category: 'payment', title: 'Payment captured', description: 'Mastercard •••• 5100.', actor: 'system', severity: 'info' }),
        ev({ at: at(-7, 15), category: 'artwork', title: 'Artwork approved', description: 'Approved by customer from proof email.', actor: 'customer', severity: 'info' }),
        ev({ at: at(-6, 8), category: 'production', title: 'Sent to production', description: 'Items split across poster and candle lines.', actor: 'facility', severity: 'info' }),
        ev({ at: at(-4, 16), category: 'shipping', title: 'Shipment 1 of 2 created', description: 'USPS Priority 9400111899223344556677 (poster only).', actor: 'system', severity: 'info', lineItemId: 'li_10491_1' }),
        ev({ at: at(-2, 13, 27), category: 'shipping', title: 'Delivered', description: 'Front door, Portland, OR.', actor: 'carrier', severity: 'info', lineItemId: 'li_10491_1' }),
        ev({ at: at(-3, 11), category: 'production', title: 'Production delayed', description: 'Wax pour backlog on candle line. New ETA +3 days.', actor: 'facility', severity: 'warning', lineItemId: 'li_10491_2' }),
        ev({ at: at(-1, 9, 30), category: 'production', title: 'Label reprint queued', description: 'First label run smudged in QC.', actor: 'facility', severity: 'warning', lineItemId: 'li_10491_2' }),
        ev({ at: at(0, 8, 2), category: 'support', title: 'Customer email received', description: '"I only got the poster. Did you forget my candles?"', actor: 'customer', severity: 'info' }),
      ],
    });
  }

  // 3. Artwork problem: low DPI, changes requested, production on hold.
  {
    const items: LineItem[] = [
      {
        id: 'li_10503_1',
        sku: 'TOTE-NAT-STD',
        name: 'Canvas Tote',
        productType: 'tote',
        options: { Color: 'Natural', Handle: 'Long' },
        quantity: 25,
        unitPrice: 14,
        artwork: artwork('art_830', 'Farmers Market Logo', 'leaf', ['#386641', '#6a994e', '#a7c957', '#f2e8cf'], {
          version: 2,
          status: 'changes_requested',
          dpi: 96,
          note: 'Uploaded file is 96 DPI. Needs 300 DPI or vector (SVG/PDF).',
        }),
        production: { status: 'on_hold', facility: 'Columbus, OH' },
        eta: { promised: at(3, 20), current: at(7, 20), confidence: 'low', reason: 'Waiting on customer artwork' },
      },
      {
        id: 'li_10503_2',
        sku: 'CARD-BUS-500',
        name: 'Business Cards (500)',
        productType: 'cards',
        options: { Stock: '16pt Matte', Corners: 'Rounded' },
        quantity: 1,
        unitPrice: 49,
        artwork: artwork('art_831', 'Farmers Market Card', 'leaf', ['#386641', '#f2e8cf'], { version: 1, status: 'pending_review', dpi: 300 }),
        production: { status: 'queued', facility: 'Columbus, OH' },
        eta: { promised: at(3, 20), current: at(5, 20), confidence: 'medium', reason: 'Held to ship with totes' },
      },
    ];
    orders.push({
      id: 'ORD-10503',
      placedAt: at(-3, 18, 40),
      status: 'artwork_review',
      channel: 'b2b',
      scenario: 'artwork_issue',
      customer: { id: 'cus_544', name: 'Green Valley Co-op', email: 'ops@greenvalley.example', tier: 'business' },
      shippingAddress: addr({ name: 'Priya Raman', line1: '1200 Market Hall Dr', line2: 'Dock B', city: 'Columbus', region: 'OH', postalCode: '43215', country: 'US', phone: '+1 614 555 0199' }),
      billingAddress: addr({ name: 'Green Valley Co-op AP', line1: 'PO Box 2231', city: 'Columbus', region: 'OH', postalCode: '43216', country: 'US' }),
      totals: totals(items, 18),
      payment: { method: 'Net 30 invoice', status: 'authorized' },
      milestones: milestones({ placed: at(-3, 18, 40), paid: at(-3, 18, 41) }, 'artwork_approved', 'artwork_approved'),
      lineItems: items,
      events: [
        ev({ at: at(-3, 18, 40), category: 'order', title: 'Order placed', description: 'B2B portal order, PO #GV-7781.', actor: 'customer', severity: 'info' }),
        ev({ at: at(-3, 18, 41), category: 'payment', title: 'Invoice authorized', description: 'Net 30 terms.', actor: 'system', severity: 'info' }),
        ev({ at: at(-3, 18, 45), category: 'artwork', title: 'Preflight failed', description: 'Tote artwork v1 is 72 DPI.', actor: 'system', severity: 'error', lineItemId: 'li_10503_1' }),
        ev({ at: at(-2, 10, 5), category: 'artwork', title: 'Artwork v2 uploaded', description: 'Customer re-uploaded tote artwork.', actor: 'customer', severity: 'info', lineItemId: 'li_10503_1' }),
        ev({ at: at(-2, 10, 6), category: 'artwork', title: 'Preflight failed', description: 'Tote artwork v2 is 96 DPI. Changes requested.', actor: 'system', severity: 'error', lineItemId: 'li_10503_1' }),
        ev({ at: at(-2, 10, 6), category: 'production', title: 'Production on hold', description: 'Both items held until tote artwork is fixed.', actor: 'system', severity: 'warning' }),
        ev({ at: at(-1, 14), category: 'support', title: 'Agent note', description: 'Sent customer the vector-file guide. — Sam (Tier 1)', actor: 'agent', severity: 'info' }),
        ev({ at: at(0, 10, 12), category: 'support', title: 'Customer called', description: '"Why hasn\'t my order shipped? It\'s been 3 days."', actor: 'customer', severity: 'info' }),
      ],
    });
  }

  // 4. Address exception at the carrier.
  {
    const items: LineItem[] = [
      {
        id: 'li_10517_1',
        sku: 'PST-12X16-GLS',
        name: 'Gloss Poster 12×16',
        productType: 'poster',
        options: { Paper: 'Gloss 250gsm', Orientation: 'Landscape' },
        quantity: 2,
        unitPrice: 26,
        artwork: artwork('art_860', 'Night Sky Over Triund', 'stars', ['#0b090a', '#22223b', '#4a4e69', '#f2e9e4']),
        production: { status: 'done', facility: 'Reno, NV' },
        eta: { promised: at(-1, 20), current: at(2, 20), confidence: 'low', reason: 'Address could not be verified by carrier' },
        shipment: shipment('shp_10517_a', 'FedEx', '794644790132', {
          status: 'exception',
          lastScan: { at: at(-1, 15, 50), location: 'Denver, CO', description: 'Incorrect address — unable to deliver' },
        }),
      },
    ];
    orders.push({
      id: 'ORD-10517',
      placedAt: at(-5, 9, 21),
      status: 'exception',
      channel: 'marketplace',
      scenario: 'address_change',
      customer: { id: 'cus_612', name: 'Lucas Ferreira', email: 'lucasf@example.com', tier: 'standard' },
      shippingAddress: addr({ name: 'Lucas Ferreira', line1: '2290 Larimer St', line2: 'Unit 4', city: 'Denver', region: 'CO', postalCode: '80250', country: 'US' }),
      billingAddress: addr({ name: 'Lucas Ferreira', line1: '2290 Larimer St', line2: 'Unit 4', city: 'Denver', region: 'CO', postalCode: '80205', country: 'US' }),
      totals: totals(items, 9.5),
      payment: { method: 'PayPal', status: 'captured' },
      milestones: milestones(
        { placed: at(-5, 9, 21), paid: at(-5, 9, 22), artwork_approved: at(-5, 11), in_production: at(-4, 8), shipped: at(-3, 16) },
        'out_for_delivery',
        'out_for_delivery',
      ),
      lineItems: items,
      events: [
        ev({ at: at(-5, 9, 21), category: 'order', title: 'Order placed', description: 'Marketplace order via Etsy connector.', actor: 'customer', severity: 'info' }),
        ev({ at: at(-5, 9, 22), category: 'payment', title: 'Payment captured', description: 'PayPal.', actor: 'system', severity: 'info' }),
        ev({ at: at(-5, 11), category: 'artwork', title: 'Artwork auto-approved', description: 'Preflight passed.', actor: 'system', severity: 'info' }),
        ev({ at: at(-3, 16), category: 'shipping', title: 'Label created', description: 'FedEx Home 794644790132.', actor: 'system', severity: 'info' }),
        ev({ at: at(-2, 7, 10), category: 'shipping', title: 'In transit', description: 'Salt Lake City, UT', actor: 'carrier', severity: 'info' }),
        ev({ at: at(-1, 15, 50), category: 'shipping', title: 'Delivery exception', description: 'Incorrect address — unable to deliver. Postal code 80250 does not match street.', actor: 'carrier', severity: 'error' }),
        ev({ at: at(-1, 16), category: 'order', title: 'Address mismatch detected', description: 'Shipping ZIP 80250 differs from billing ZIP 80205.', actor: 'system', severity: 'warning' }),
        ev({ at: at(0, 11, 30), category: 'support', title: 'Customer chat', description: '"FedEx says my address is wrong? It should be 80205."', actor: 'customer', severity: 'info' }),
      ],
    });
  }

  // 5. Delivered, but customer says not received.
  {
    const items: LineItem[] = [
      {
        id: 'li_10529_1',
        sku: 'MUG-15OZ-BLK',
        name: 'Ceramic Mug 15oz',
        productType: 'mug',
        options: { Color: 'Black', Finish: 'Matte' },
        quantity: 4,
        unitPrice: 21,
        artwork: artwork('art_890', 'Chai O’Clock', 'sun', ['#9c6644', '#ddb892', '#ede0d4']),
        production: { status: 'done', facility: 'Austin, TX' },
        eta: { promised: at(-3, 20), current: at(-3, 20), confidence: 'high' },
        shipment: shipment('shp_10529_a', 'UPS', '1Z999AA10198765432', {
          status: 'delivered',
          lastScan: { at: at(-3, 14, 3), location: 'Austin, TX', description: 'Delivered — left at front desk' },
        }),
      },
    ];
    orders.push({
      id: 'ORD-10529',
      placedAt: at(-9, 20, 15),
      status: 'delivered',
      channel: 'web',
      scenario: 'not_received',
      customer: { id: 'cus_720', name: 'Aisha Khan', email: 'aisha.k@example.com', tier: 'plus' },
      shippingAddress: addr({ name: 'Aisha Khan', line1: '500 W 2nd St', line2: 'Suite 1900 (front desk)', city: 'Austin', region: 'TX', postalCode: '78701', country: 'US' }),
      billingAddress: addr({ name: 'Aisha Khan', line1: '13 Riverside Dr', city: 'Austin', region: 'TX', postalCode: '78704', country: 'US' }),
      totals: totals(items, 0),
      payment: { method: 'Amex •••• 1005', status: 'captured' },
      milestones: milestones(
        { placed: at(-9, 20, 15), paid: at(-9, 20, 16), artwork_approved: at(-9, 21), in_production: at(-8, 9), shipped: at(-6, 17), out_for_delivery: at(-3, 8), delivered: at(-3, 14, 3) },
        'delivered',
      ),
      lineItems: items,
      events: [
        ev({ at: at(-9, 20, 15), category: 'order', title: 'Order placed', description: 'Web storefront.', actor: 'customer', severity: 'info' }),
        ev({ at: at(-9, 20, 16), category: 'payment', title: 'Payment captured', description: 'Amex •••• 1005.', actor: 'system', severity: 'info' }),
        ev({ at: at(-8, 9), category: 'production', title: 'Sent to production', description: 'Austin, TX.', actor: 'facility', severity: 'info' }),
        ev({ at: at(-6, 17), category: 'shipping', title: 'Label created', description: 'UPS Ground 1Z999AA10198765432.', actor: 'system', severity: 'info' }),
        ev({ at: at(-3, 8), category: 'shipping', title: 'Out for delivery', description: 'Austin, TX', actor: 'carrier', severity: 'info' }),
        ev({ at: at(-3, 14, 3), category: 'shipping', title: 'Delivered', description: 'Left at front desk. Signed: "RECEPTION".', actor: 'carrier', severity: 'info', meta: { proof_of_delivery: 'signature' } }),
        ev({ at: at(0, 12, 45), category: 'support', title: 'Customer email', description: '"Tracking says delivered but nothing arrived."', actor: 'customer', severity: 'info' }),
      ],
    });
  }

  // 6. Brand new order: label created, no carrier scans yet (empty states).
  {
    const items: LineItem[] = [
      {
        id: 'li_10533_1',
        sku: 'TEE-UNI-L-WHT',
        name: 'Unisex Tee',
        productType: 'tshirt',
        options: { Size: 'L', Color: 'White' },
        quantity: 3,
        unitPrice: 24,
        artwork: artwork('art_910', 'Team Offsite 2026', 'grid', ['#ef476f', '#ffd166', '#06d6a0', '#118ab2']),
        production: { status: 'packed', facility: 'Columbus, OH' },
        eta: { promised: at(3, 20), current: at(3, 20), confidence: 'high' },
        shipment: shipment('shp_10533_a', 'DHL', 'JD014600006277842901', { status: 'label_created' }),
      },
    ];
    orders.push({
      id: 'ORD-10533',
      placedAt: at(-1, 11, 2),
      status: 'shipped',
      channel: 'web',
      scenario: 'no_tracking_yet',
      customer: { id: 'cus_733', name: 'Hiro Tanaka', email: 'hiro.t@example.com', tier: 'standard' },
      shippingAddress: addr({ name: 'Hiro Tanaka', line1: '77 Mission Bay Blvd', city: 'San Francisco', region: 'CA', postalCode: '94158', country: 'US' }),
      billingAddress: addr({ name: 'Hiro Tanaka', line1: '77 Mission Bay Blvd', city: 'San Francisco', region: 'CA', postalCode: '94158', country: 'US' }),
      totals: totals(items, 12),
      payment: { method: 'Visa •••• 0077', status: 'captured' },
      milestones: milestones(
        { placed: at(-1, 11, 2), paid: at(-1, 11, 3), artwork_approved: at(-1, 12), in_production: at(-1, 15), shipped: at(0, 9) },
        'shipped',
      ),
      lineItems: items,
      events: [
        ev({ at: at(-1, 11, 2), category: 'order', title: 'Order placed', description: 'Rush production requested.', actor: 'customer', severity: 'info' }),
        ev({ at: at(-1, 11, 3), category: 'payment', title: 'Payment captured', description: 'Visa •••• 0077.', actor: 'system', severity: 'info' }),
        ev({ at: at(-1, 12), category: 'artwork', title: 'Artwork auto-approved', description: 'Preflight passed.', actor: 'system', severity: 'info' }),
        ev({ at: at(-1, 15), category: 'production', title: 'Rush production started', description: 'Columbus, OH.', actor: 'facility', severity: 'info' }),
        ev({ at: at(0, 9), category: 'shipping', title: 'Label created', description: 'DHL Express JD014600006277842901. Awaiting pickup.', actor: 'system', severity: 'info' }),
      ],
    });
  }

  // 7. Large B2B order: many line items and events, lots of scrolling.
  {
    const motifs: Artwork['motif'][] = ['mountain', 'sun', 'waves', 'grid', 'leaf', 'stars'];
    const palettes = [
      ['#003049', '#d62828', '#f77f00', '#fcbf49'],
      ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c'],
      ['#606c38', '#283618', '#fefae0', '#bc6c25'],
      ['#3d405b', '#81b29a', '#f2cc8f', '#e07a5f'],
      ['#22223b', '#4a4e69', '#9a8c98', '#c9ada7'],
      ['#355070', '#6d597a', '#b56576', '#eaac8b'],
    ];
    const products: Pick<LineItem, 'sku' | 'name' | 'productType' | 'options' | 'unitPrice'>[] = [
      { sku: 'TEE-UNI-S-BLK', name: 'Unisex Tee', productType: 'tshirt', options: { Size: 'S', Color: 'Black' }, unitPrice: 22 },
      { sku: 'TEE-UNI-M-BLK', name: 'Unisex Tee', productType: 'tshirt', options: { Size: 'M', Color: 'Black' }, unitPrice: 22 },
      { sku: 'TEE-UNI-L-BLK', name: 'Unisex Tee', productType: 'tshirt', options: { Size: 'L', Color: 'Black' }, unitPrice: 22 },
      { sku: 'MUG-11OZ-WHT', name: 'Ceramic Mug 11oz', productType: 'mug', options: { Color: 'White', Finish: 'Gloss' }, unitPrice: 16 },
      { sku: 'TOTE-NAT-STD', name: 'Canvas Tote', productType: 'tote', options: { Color: 'Natural', Handle: 'Long' }, unitPrice: 13 },
      { sku: 'CND-8OZ-AMB', name: 'Custom Label Candle 8oz', productType: 'candle', options: { Scent: 'Sandalwood', Jar: 'Amber' }, unitPrice: 20 },
    ];
    const items: LineItem[] = products.map((p, i) => {
      const shipped = i < 4;
      return {
        id: `li_10540_${i + 1}`,
        ...p,
        quantity: [40, 60, 40, 80, 120, 50][i],
        artwork: artwork(`art_95${i}`, `Summit Conf ${['Logo', 'Logo', 'Logo', 'Badge', 'Wordmark', 'Label'][i]}`, motifs[i], palettes[i]),
        production: { status: shipped ? 'done' : i === 4 ? 'quality_check' : 'printing', facility: i < 3 ? 'Columbus, OH' : 'Austin, TX' },
        eta: shipped
          ? { promised: at(1, 20), current: at(1, 20), confidence: 'high' }
          : { promised: at(1, 20), current: at(3, 20), confidence: 'medium', reason: 'Second wave ships from Austin, TX' },
        shipment: shipped
          ? shipment(i < 3 ? 'shp_10540_a' : 'shp_10540_b', 'FedEx', i < 3 ? '786621045530' : '786621045541', {
              status: 'in_transit',
              lastScan: { at: at(-1, 22, 15), location: 'Memphis, TN', description: 'Arrived at FedEx hub' },
            })
          : undefined,
      } satisfies LineItem;
    });
    const events: OrderEvent[] = [
      ev({ at: at(-8, 9), category: 'order', title: 'Order placed', description: 'B2B portal, PO #SUM-2026-114.', actor: 'customer', severity: 'info' }),
      ev({ at: at(-8, 9, 1), category: 'payment', title: 'Invoice authorized', description: 'Net 45 terms.', actor: 'system', severity: 'info' }),
      ev({ at: at(-8, 13), category: 'artwork', title: 'Proofs sent', description: '6 proofs emailed to buyer.', actor: 'system', severity: 'info' }),
      ev({ at: at(-7, 16), category: 'artwork', title: 'Proofs approved', description: 'All 6 approved by buyer.', actor: 'customer', severity: 'info' }),
    ];
    items.forEach((li, i) => {
      events.push(
        ev({ at: at(-6, 8 + i), category: 'production', title: 'Sent to production', description: `${li.name} (${li.options.Size ?? li.options.Color ?? ''}) × ${li.quantity} → ${li.production.facility}.`, actor: 'facility', severity: 'info', lineItemId: li.id }),
      );
      if (li.shipment) {
        events.push(
          ev({ at: at(-3, 10 + i), category: 'production', title: 'Quality check passed', description: 'Batch sample approved.', actor: 'facility', severity: 'info', lineItemId: li.id }),
        );
      }
    });
    events.push(
      ev({ at: at(-2, 17), category: 'shipping', title: 'Shipment 1 of 2 created', description: 'FedEx Freight 786621045530 (tees).', actor: 'system', severity: 'info' }),
      ev({ at: at(-2, 17, 5), category: 'shipping', title: 'Shipment 2 of 2 created', description: 'FedEx Ground 786621045541 (mugs).', actor: 'system', severity: 'info' }),
      ev({ at: at(-1, 22, 15), category: 'shipping', title: 'Arrived at hub', description: 'Memphis, TN', actor: 'carrier', severity: 'info' }),
      ev({ at: at(-1, 9), category: 'production', title: 'Second wave delayed', description: 'Totes and candles moved to Austin, TX to clear backlog.', actor: 'facility', severity: 'warning' }),
      ev({ at: at(0, 8, 40), category: 'support', title: 'Buyer email', description: '"We need everything by Friday for the conference — can you confirm?"', actor: 'customer', severity: 'info' }),
    );
    orders.push({
      id: 'ORD-10540',
      placedAt: at(-8, 9),
      status: 'partially_shipped',
      channel: 'b2b',
      scenario: 'bulk_eta_check',
      customer: { id: 'cus_801', name: 'Summit Conferences LLC', email: 'buyer@summitconf.example', tier: 'business' },
      shippingAddress: addr({ name: 'Events Receiving', line1: '650 S Prairie Ave', line2: 'Loading Dock 3', city: 'Chicago', region: 'IL', postalCode: '60616', country: 'US', phone: '+1 312 555 0110' }),
      billingAddress: addr({ name: 'Summit Conferences AP', line1: '233 S Wacker Dr', line2: 'Floor 51', city: 'Chicago', region: 'IL', postalCode: '60606', country: 'US' }),
      totals: totals(items, 145, 250),
      payment: { method: 'Net 45 invoice', status: 'authorized' },
      milestones: milestones(
        { placed: at(-8, 9), paid: at(-8, 9, 1), artwork_approved: at(-7, 16), in_production: at(-6, 8), shipped: at(-2, 17) },
        'shipped',
      ),
      lineItems: items,
      events,
    });
  }

  for (const o of orders) {
    o.events.sort((a, b) => b.at.localeCompare(a.at));
  }
  return orders;
}

export function listOrders(): Order[] {
  return buildOrders();
}

export function getOrder(id: string): Order | undefined {
  return buildOrders().find((o) => o.id.toLowerCase() === id.toLowerCase());
}

export function summarizeOrder(o: Order): OrderSummary {
  const etas = o.lineItems.map((li) => li.eta.current).sort();
  const flags: string[] = [];
  if (o.lineItems.some((li) => li.eta.current > li.eta.promised)) flags.push('ETA slipped');
  if (o.lineItems.some((li) => li.shipment?.status === 'exception')) flags.push('Carrier exception');
  if (o.lineItems.some((li) => li.artwork.status === 'changes_requested')) flags.push('Artwork blocked');
  if (o.status === 'partially_shipped') flags.push('Split shipment');
  return {
    id: o.id,
    placedAt: o.placedAt,
    status: o.status,
    customerName: o.customer.name,
    itemCount: o.lineItems.reduce((s, li) => s + li.quantity, 0),
    total: o.totals.total,
    nextEta: etas[etas.length - 1],
    flags,
  };
}

/** Matches order id, tracking number, customer name or email. */
export function searchOrders(query: string): OrderSummary[] {
  const q = query.trim().toLowerCase();
  const all = buildOrders();
  const hits = q
    ? all.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.customer.name.toLowerCase().includes(q) ||
          o.customer.email.toLowerCase().includes(q) ||
          o.lineItems.some((li) => li.shipment?.trackingNumber.toLowerCase().includes(q)),
      )
    : all;
  return hits.map(summarizeOrder);
}
