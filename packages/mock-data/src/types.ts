export type OrderStatus =
  | 'placed'
  | 'artwork_review'
  | 'in_production'
  | 'partially_shipped'
  | 'shipped'
  | 'delivered'
  | 'exception';

export interface Address {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone?: string;
}

export type MilestoneKey =
  | 'placed'
  | 'paid'
  | 'artwork_approved'
  | 'in_production'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered';

export interface Milestone {
  key: MilestoneKey;
  label: string;
  at?: string;
  state: 'done' | 'current' | 'upcoming' | 'blocked';
}

export type ArtworkMotif = 'mountain' | 'sun' | 'waves' | 'grid' | 'leaf' | 'stars';

export interface Artwork {
  id: string;
  name: string;
  version: number;
  status: 'approved' | 'pending_review' | 'changes_requested';
  dpi: number;
  palette: string[];
  motif: ArtworkMotif;
  note?: string;
}

export type Carrier = 'UPS' | 'FedEx' | 'USPS' | 'DHL';

export interface Shipment {
  id: string;
  carrier: Carrier;
  trackingNumber: string;
  status: 'label_created' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';
  trackingUrl: string;
  lastScan?: { at: string; location: string; description: string };
}

export interface LineItem {
  id: string;
  sku: string;
  name: string;
  productType: 'mug' | 'tshirt' | 'poster' | 'candle' | 'tote' | 'cards';
  options: Record<string, string>;
  quantity: number;
  unitPrice: number;
  artwork: Artwork;
  production: {
    status: 'queued' | 'printing' | 'quality_check' | 'packed' | 'on_hold' | 'done';
    facility: string;
  };
  eta: {
    promised: string;
    current: string;
    confidence: 'high' | 'medium' | 'low';
    reason?: string;
  };
  shipment?: Shipment;
}

export type EventCategory = 'order' | 'payment' | 'artwork' | 'production' | 'shipping' | 'support';

export interface OrderEvent {
  id: string;
  at: string;
  category: EventCategory;
  title: string;
  description: string;
  actor: 'system' | 'customer' | 'agent' | 'carrier' | 'facility';
  severity: 'info' | 'warning' | 'error';
  lineItemId?: string;
  meta?: Record<string, string | number>;
}

export interface Order {
  id: string;
  placedAt: string;
  status: OrderStatus;
  channel: 'web' | 'marketplace' | 'b2b';
  customer: { id: string; name: string; email: string; tier: 'standard' | 'plus' | 'business' };
  shippingAddress: Address;
  billingAddress: Address;
  totals: {
    subtotal: number;
    shipping: number;
    tax: number;
    discount: number;
    total: number;
    currency: 'USD';
  };
  payment: { method: string; status: 'captured' | 'authorized' | 'partially_refunded' };
  milestones: Milestone[];
  lineItems: LineItem[];
  events: OrderEvent[];
  /** What a support agent would typically be asked about this order. Used by the agent simulator only. */
  scenario: string;
}

export interface OrderSummary {
  id: string;
  placedAt: string;
  status: OrderStatus;
  customerName: string;
  itemCount: number;
  total: number;
  nextEta?: string;
  flags: string[];
}
