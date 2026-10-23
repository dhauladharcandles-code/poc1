import type { InvestigationInput } from './types';

export const SESSION_TIMEOUT_MS = 30 * 60_000;
export const INVESTIGATION_TIMEOUT_MS = 30 * 60_000;

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function read<T>(storage: Storage | undefined, key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: Storage | undefined, key: string, value: unknown) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — ids just won't persist */
  }
}

const local = () => (typeof localStorage !== 'undefined' ? localStorage : undefined);
const sessionStore = () => (typeof sessionStorage !== 'undefined' ? sessionStorage : undefined);

export interface SessionState {
  id: string;
  startedAt: number;
  lastActivityAt: number;
  entry_point: string;
  referrer_host: string | null;
}

/** Rolling 30-minute session shared by all tabs and zones on the origin. */
export function resolveSession(now: number, entry: () => { entry_point: string; referrer_host: string | null }): { session: SessionState; isNew: boolean } {
  const existing = read<SessionState>(local(), 'poc.session');
  if (existing && now - existing.lastActivityAt < SESSION_TIMEOUT_MS) {
    existing.lastActivityAt = now;
    write(local(), 'poc.session', existing);
    return { session: existing, isNew: false };
  }
  const session: SessionState = { id: uuid(), startedAt: now, lastActivityAt: now, ...entry() };
  write(local(), 'poc.session', session);
  return { session, isNew: true };
}

export function touchSession(now: number) {
  const s = read<SessionState>(local(), 'poc.session');
  if (s) {
    s.lastActivityAt = now;
    write(local(), 'poc.session', s);
  }
}

/** One id per browser tab (survives reloads and zone hops inside the tab). */
export function resolveTabId(): { id: string; isNew: boolean } {
  const existing = read<string>(sessionStore(), 'poc.tab');
  if (existing) return { id: existing, isNew: false };
  const id = uuid();
  write(sessionStore(), 'poc.tab', id);
  return { id, isNew: true };
}

export interface InvestigationState {
  id: string;
  orderId: string;
  startedAt: number;
  lastActivityAt: number;
  ticketId: string | null;
  reason: string | null;
}

type InvestigationMap = Record<string, InvestigationState>;

/**
 * An investigation = one agent working one order within a 30-minute activity window.
 * Keyed by order so two tabs on the same order share it, while tabs on different orders don't.
 */
export function resolveInvestigation(input: InvestigationInput, now: number): { state: InvestigationState; isNew: boolean } {
  const map = read<InvestigationMap>(local(), 'poc.investigations') ?? {};
  const key = input.orderId.toUpperCase();
  const existing = map[key];
  if (existing && now - existing.lastActivityAt < INVESTIGATION_TIMEOUT_MS) {
    existing.lastActivityAt = now;
    if (input.ticketId && !existing.ticketId) existing.ticketId = input.ticketId;
    if (input.reason && !existing.reason) existing.reason = input.reason;
    map[key] = existing;
    write(local(), 'poc.investigations', prune(map, now));
    return { state: existing, isNew: false };
  }
  const state: InvestigationState = {
    id: uuid(),
    orderId: key,
    startedAt: now,
    lastActivityAt: now,
    ticketId: input.ticketId ?? null,
    reason: input.reason ?? null,
  };
  map[key] = state;
  write(local(), 'poc.investigations', prune(map, now));
  return { state, isNew: true };
}

export function touchInvestigation(orderId: string, now: number) {
  const map = read<InvestigationMap>(local(), 'poc.investigations');
  const s = map?.[orderId.toUpperCase()];
  if (map && s) {
    s.lastActivityAt = now;
    write(local(), 'poc.investigations', map);
  }
}

function prune(map: InvestigationMap, now: number): InvestigationMap {
  const out: InvestigationMap = {};
  for (const [k, v] of Object.entries(map)) if (now - v.lastActivityAt < 24 * 3_600_000) out[k] = v;
  return out;
}

const HELPDESKS: [RegExp, string][] = [
  [/zendesk\./, 'zendesk'],
  [/gorgias\./, 'gorgias'],
  [/freshdesk\./, 'freshdesk'],
  [/intercom\./, 'intercom'],
  [/salesforce\.|force\.com/, 'salesforce'],
  [/hubspot\./, 'hubspot'],
  [/slack\.com/, 'slack'],
  [/mail\.google\.com|outlook\./, 'email'],
];

/**
 * Where did the agent come from? Explicit `?src=` wins, then utm_source, then the referrer.
 * Internal navigation is reported as `internal` so a hop from the order queue isn't counted as a new entry.
 */
export function classifyEntry(href: string, referrer: string): { entry_point: string; referrer_host: string | null } {
  let url: URL | null = null;
  try {
    url = new URL(href);
  } catch {
    /* ignore */
  }
  const src = url?.searchParams.get('src') ?? url?.searchParams.get('utm_source');
  let refHost: string | null = null;
  try {
    refHost = referrer ? new URL(referrer).host : null;
  } catch {
    refHost = null;
  }
  if (src) return { entry_point: src, referrer_host: refHost };
  if (!refHost) return { entry_point: 'direct', referrer_host: null };
  if (url && refHost === url.host) return { entry_point: 'internal', referrer_host: refHost };
  for (const [re, name] of HELPDESKS) if (re.test(refHost)) return { entry_point: name, referrer_host: refHost };
  return { entry_point: 'external_link', referrer_host: refHost };
}
