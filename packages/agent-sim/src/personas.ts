import type { Agent } from './helpers.ts';

export interface Persona {
  name: string;
  /** What the run is about; the simulator never sends this — it's what the dashboard should infer. */
  intent: string;
  /** URL path the agent starts from (queue or a helpdesk deep link). */
  start: (order: string) => string;
  order: string;
  run: (a: Agent, order: string) => Promise<void>;
}

const helpdesk = (ticket: string, reason: string) => (order: string) => `/orders/${order}?src=helpdesk&ticket=${ticket}&reason=${reason}`;

async function fromQueue(a: Agent, order: string, opts: { search?: boolean; paste?: boolean } = {}) {
  await a.read(2);
  if (opts.paste) await a.paste('input[data-track-field="order_search"]', order);
  else if (opts.search) {
    await a.page.click('input[data-track-field="order_search"]');
    await a.page.keyboard.type(order.slice(-5), { delay: 60 });
    await a.beat(900);
  }
  await a.click(`a[href^="/orders/${order}"]`);
  await a.page.waitForURL(`**/orders/${order}**`);
  await a.beat(1200);
}

export const PERSONAS: Persona[] = [
  {
    name: 'wismo_efficient',
    intent: 'where_is_my_order',
    order: 'ORD-10482',
    start: helpdesk('T-48213', 'wismo'),
    async run(a) {
      await a.read(3);
      await a.wheel(700);
      await a.hover('[data-track-id="line_item.eta"]', 2.5);
      await a.read(4);
      await a.click('[data-track-id="copy.tracking_number"]');
      await a.leaveTab(25 + Math.random() * 20); // pasted into the helpdesk reply
      await a.click('[data-track-id="line_item.view_events"]');
      await a.click('[data-track-id="events_panel.tab"][data-track-key="shipping"]');
      await a.read(6);
      await a.click('[data-track-id="events_panel.close"]');
      await a.read(2);
    },
  },
  {
    name: 'wismo_struggling',
    intent: 'where_is_my_order',
    order: 'ORD-10482',
    start: () => '/',
    async run(a, order) {
      await fromQueue(a, order, { paste: true });
      await a.read(4);
      await a.scrollToBottom();
      await a.read(3);
      await a.scrollToTop();
      await a.wheel(600);
      // Expects the tracking number to be a link.
      await a.click('[data-track-field="tracking_number"]');
      await a.page.clock.fastForward(1_000);
      await a.rageClick('[data-track-field="tracking_number"]');
      await a.findInPage();
      await a.read(5);
      await a.copyText('[data-track-field="tracking_number"]');
      await a.leaveTab(70 + Math.random() * 40); // checking UPS
      await a.click('[data-track-id="order_header.view_events"]');
      for (const tab of ['shipping', 'production', 'order', 'shipping', 'support']) {
        await a.click(`[data-track-id="events_panel.tab"][data-track-key="${tab}"]`);
        await a.read(1.5);
      }
      await a.click('[data-track-id="events_panel.tab"][data-track-key="shipping"]');
      await a.click('[data-track-id="events_panel.row"]', { nth: 1 });
      await a.read(6);
      await a.page.keyboard.press('Escape');
      await a.idle(80); // on the phone with the customer
      await a.click('[data-track-id="line_item.carrier_link"]');
      await a.leaveTab(40);
      await a.read(2);
    },
  },
  {
    name: 'missing_items',
    intent: 'missing_items',
    order: 'ORD-10491',
    start: helpdesk('T-48217', 'missing_items'),
    async run(a) {
      await a.read(3);
      await a.wheel(800);
      await a.read(2);
      await a.click('[data-track-id="line_item.view_events"]', { nth: 1 });
      await a.read(5);
      await a.click('[data-track-id="events_panel.tab"][data-track-key="production"]');
      await a.click('[data-track-id="events_panel.row"]', { nth: 0 });
      await a.read(6);
      await a.click('[data-track-id="events_panel.close"]');
      await a.hover('[data-track-id="line_item.eta"]', 2, 1);
      await a.click('[data-track-id="line_item.details_toggle"]', { nth: 1 });
      await a.read(5);
      await a.otherWindow(35); // writing the reply in the helpdesk window
      await a.read(2);
    },
  },
  {
    name: 'artwork_blocked',
    intent: 'artwork_issue',
    order: 'ORD-10503',
    // The customer *says* it's a delay; the real problem is the artwork.
    start: helpdesk('T-48222', 'order_delay'),
    async run(a) {
      await a.read(4);
      await a.click('[data-track-id="order_timeline.step"][data-track-key="artwork_approved"]');
      await a.read(5);
      await a.click('[data-track-id="events_panel.row"]', { nth: 1 });
      await a.read(4);
      await a.click('[data-track-id="events_panel.close"]');
      await a.wheel(700);
      await a.click('[data-track-id="line_item.artwork"]');
      await a.read(2);
      await a.click('[data-track-id="artwork_preview.zoom"][data-track-key="2"]');
      await a.read(3);
      await a.click('[data-track-id="artwork_preview.zoom"][data-track-key="4"]');
      await a.wheel(300);
      await a.read(4);
      await a.page.keyboard.press('Escape');
      await a.click('[data-track-id="line_item.details_toggle"]');
      await a.selectText('.li-details .banner');
      await a.read(3);
      await a.leaveTab(50);
      await a.read(2);
    },
  },
  {
    name: 'address_fix',
    intent: 'address_change',
    order: 'ORD-10517',
    start: helpdesk('T-48230', 'address_change'),
    async run(a) {
      await a.read(3);
      await a.moveTo('[data-track-id="address_card.shipping"]');
      await a.read(8);
      await a.selectText('[data-track-field="postal_code"]');
      await a.read(2);
      await a.hover('[data-track-id="address_card.billing"]', 3);
      await a.click('[data-track-id="copy.shipping_address"]');
      await a.otherWindow(45);
      await a.click('[data-track-id="order_timeline.step"][data-track-key="out_for_delivery"]');
      await a.read(5);
      await a.click('[data-track-id="events_panel.close"]');
      await a.read(2);
    },
  },
  {
    name: 'not_received',
    intent: 'delivery_dispute',
    order: 'ORD-10529',
    start: helpdesk('T-48236', 'not_received'),
    async run(a) {
      await a.read(3);
      await a.click('[data-track-id="order_header.view_events"]');
      await a.click('[data-track-id="events_panel.tab"][data-track-key="shipping"]');
      await a.click('[data-track-id="events_panel.row"]', { nth: 0 });
      await a.read(6);
      await a.copyText('[data-track-field="event_id"]');
      await a.click('[data-track-id="events_panel.close"]');
      await a.wheel(700);
      await a.click('[data-track-id="copy.tracking_number"]');
      await a.click('[data-track-id="line_item.carrier_link"]');
      await a.leaveTab(60);
      await a.read(3);
    },
  },
  {
    name: 'b2b_bulk_check',
    intent: 'order_delay',
    order: 'ORD-10540',
    start: () => '/',
    async run(a, order) {
      await fromQueue(a, order, { search: true });
      await a.read(3);
      await a.click('[data-track-id="order_header.breakdown_toggle"]');
      await a.read(3);
      for (let i = 0; i < 6; i++) {
        await a.wheel(330);
        if (i % 2 === 0) await a.hover('[data-track-id="line_item.eta"]', 1.5, i);
        await a.read(1.5);
      }
      await a.click('[data-track-id="order_header.view_events"]');
      const list = '[data-track-id="events_panel.list"]';
      await a.moveTo(list);
      for (let i = 0; i < 5; i++) await a.wheel(260);
      await a.read(4);
      await a.click('[data-track-id="events_panel.close"]');
      await a.idle(95);
      await a.click('[data-track-id="copy.order_id"]');
      await a.otherWindow(20);
      await a.read(2);
    },
  },
  {
    name: 'no_scans_yet',
    intent: 'where_is_my_order',
    order: 'ORD-10533',
    start: () => '/',
    async run(a, order) {
      await fromQueue(a, order);
      await a.read(3);
      await a.wheel(600);
      await a.read(3);
      await a.click('.tracking-no');
      await a.read(1);
      await a.click('[data-track-id="line_item.view_events"]');
      await a.click('[data-track-id="events_panel.tab"][data-track-key="support"]');
      await a.read(2);
      await a.click('[data-track-id="events_panel.tab"][data-track-key="shipping"]');
      await a.read(3);
      await a.click('[data-track-id="events_panel.close"]');
      await a.findInPage();
      await a.copyText('[data-track-field="tracking_number"]');
      await a.leaveTab(30);
      await a.read(2);
    },
  },
];
