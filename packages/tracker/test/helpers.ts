import { createTracker } from '../src/core';
import type { Destination, Plugin, Props } from '../src/types';

export interface Captured {
  type: 'track' | 'page' | 'identify';
  name: string;
  props: Props;
}

/** A tracker wired to an in-memory destination. */
export function setup(plugins: Plugin[] = []) {
  const events: Captured[] = [];
  const dest: Destination = {
    name: 'memory',
    track: (name, props) => events.push({ type: 'track', name, props }),
    page: (name, props) => events.push({ type: 'page', name, props }),
    identify: (a) => events.push({ type: 'identify', name: a.id, props: { ...a } }),
  };
  const tracker = createTracker({ config: { zone: 'test', collectorUrl: 'http://localhost/api' }, destinations: [dest], plugins });
  const named = (n: string) => events.filter((e) => e.name === n);
  return { tracker, events, named };
}

export function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

export function setFocus(focused: boolean) {
  document.hasFocus = () => focused;
  window.dispatchEvent(new FocusEvent(focused ? 'focus' : 'blur'));
}
