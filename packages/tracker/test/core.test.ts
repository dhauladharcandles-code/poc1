import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyEntry, resolveInvestigation } from '../src/ids';
import { detectType, hashText } from '../src/dom';
import { setup } from './helpers';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('core', () => {
  it('stamps every event with the common context', () => {
    const { tracker, named } = setup();
    tracker.page('order_detail');
    tracker.track('Element Clicked', { element_id: 'x' });
    const e = named('Element Clicked')[0];
    expect(e.props).toMatchObject({ zone: 'test', page_type: 'order_detail', element_id: 'x' });
    expect(e.props.session_id).toBeTypeOf('string');
    expect(e.props.tab_id).toBeTypeOf('string');
    expect(e.props.page_view_id).toBe(named('order_detail')[0].props.page_view_id);
  });

  it('holds events fired before the first page view and releases them with page context', () => {
    const { tracker, events } = setup();
    tracker.track('Empty State Shown', { element_id: 'line_item.shipment' });
    expect(events).toHaveLength(0);
    tracker.setInvestigation({ orderId: 'ORD-1', ticketId: 'T-1', reason: 'wismo', orderStatus: 'shipped' });
    tracker.page('order_detail');
    expect(events.map((e) => e.name)).toEqual(['order_detail', 'Investigation Started', 'Empty State Shown']);
    const pv = events[0].props.page_view_id;
    for (const e of events) {
      expect(e.props.page_view_id).toBe(pv);
      expect(e.props.order_id).toBe('ORD-1');
    }
    expect(events[1].props).toMatchObject({ ticket_reason: 'wismo', order_status: 'shipped' });
  });

  it('releases held events after a timeout when no page view comes', () => {
    const { tracker, events } = setup();
    tracker.track('Error Encountered', { kind: 'js' });
    vi.advanceTimersByTime(2_100);
    expect(events.map((e) => e.name)).toEqual(['Error Encountered']);
  });

  it('reuses the investigation for the same order and starts a new one after 30 minutes', () => {
    const a = resolveInvestigation({ orderId: 'ORD-1' }, 0);
    const b = resolveInvestigation({ orderId: 'ord-1' }, 10 * 60_000);
    const c = resolveInvestigation({ orderId: 'ORD-1' }, 10 * 60_000 + 31 * 60_000);
    const d = resolveInvestigation({ orderId: 'ORD-2' }, 10 * 60_000);
    expect(a.isNew).toBe(true);
    expect(b.state.id).toBe(a.state.id);
    expect(c.state.id).not.toBe(a.state.id);
    expect(d.state.id).not.toBe(a.state.id);
  });

  it('does not count derived/passive events as the agent’s last action', () => {
    const { tracker } = setup();
    tracker.page('order_detail');
    tracker.track('Content Copied', { element_id: 'copy.tracking_number' });
    tracker.track('Dead Click Detected', { element_id: 'x' });
    tracker.track('Element Viewed', { element_id: 'y' });
    expect(tracker.memory.lastAction?.event).toBe('Content Copied');
  });

  it('records button copies without the copied text', () => {
    const { tracker, named } = setup();
    tracker.page('order_detail');
    tracker.copied('1Z999AA10123456784', 'tracking_number');
    const e = named('Content Copied')[0].props;
    expect(e).toMatchObject({ field: 'tracking_number', method: 'button', detected_type: 'tracking_number', text_length: 18 });
    expect(JSON.stringify(e)).not.toContain('1Z999AA10123456784');
    expect(tracker.memory.lastCopy?.field).toBe('tracking_number');
  });
});

describe('entry classification', () => {
  it.each([
    ['http://app/orders/1?src=helpdesk', '', 'helpdesk'],
    ['http://app/orders/1?utm_source=slack', '', 'slack'],
    ['http://app/orders/1', '', 'direct'],
    ['http://app/orders/1', 'http://app/', 'internal'],
    ['http://app/orders/1', 'https://acme.zendesk.com/agent/tickets/1', 'zendesk'],
    ['http://app/orders/1', 'https://example.org/', 'external_link'],
  ])('%s from %s → %s', (href, ref, expected) => {
    expect(classifyEntry(href, ref).entry_point).toBe(expected);
  });
});

describe('text classification', () => {
  it.each([
    ['ORD-10482', 'order_id'],
    ['1Z999AA10123456784', 'tracking_number'],
    ['794644790132', 'tracking_number'],
    ['maya.t@example.com', 'email'],
    ['$74.02', 'money'],
    ['MUG-11OZ-WHT', 'sku'],
    ['4417 Cedar Hollow Rd', 'address'],
    ['evt_0043', 'internal_id'],
  ])('%s → %s', (text, type) => expect(detectType(text)).toBe(type));

  it('hashes deterministically', () => {
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashText('abc')).not.toBe(hashText('abd'));
  });
});
