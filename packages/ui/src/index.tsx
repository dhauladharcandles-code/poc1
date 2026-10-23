'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { SUPPORT_AGENTS, type SupportAgent } from '@poc/mock-data';
import { EVENTS } from '@poc/tracker';
import { AGENT_STORAGE_KEY, readStoredAgent, useTracker } from '@poc/tracker/react';

type ZoneLink = { href: string; label: string; zone: string };

// Cross-zone links are plain <a> on purpose: each zone is its own Next.js app (multi-zones),
// so moving between them is a full document navigation.
const LINKS: ZoneLink[] = [
  { href: '/', label: 'Order queue', zone: 'shell' },
  { href: '/insights', label: 'Agent insights', zone: 'insights' },
];

export function AppHeader({ zone }: { zone: string }) {
  return (
    <header className="app-header" data-track-id="app_header" data-track-section="header">
      <a className="brand" href="/" style={{ textDecoration: 'none' }}>
        <span className="brand-mark">◆</span> Printwell Support
      </a>
      <nav>
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} aria-current={l.zone === zone || (zone === 'orders' && l.zone === 'shell') ? 'page' : undefined}>
            {l.label}
          </a>
        ))}
      </nav>
      <div className="spacer" />
      <span className="zone-tag" title="Which micro frontend rendered this page">
        zone: {zone}
      </span>
      <AgentPicker />
    </header>
  );
}

function toIdentity(a: SupportAgent) {
  return { id: a.id, name: a.name, team: a.team, tenure_months: a.tenureMonths };
}

/** Demo stand-in for SSO: who is the agent? Stored in localStorage so every zone sees it. */
export function AgentPicker() {
  const tracker = useTracker();
  const [agentId, setAgentId] = useState<string>('');

  useEffect(() => {
    const stored = readStoredAgent();
    if (stored) setAgentId(stored.id);
    else {
      const first = SUPPORT_AGENTS[0];
      localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(toIdentity(first)));
      setAgentId(first.id);
      tracker?.identify(toIdentity(first));
    }
  }, [tracker]);

  function onChange(id: string) {
    const agent = SUPPORT_AGENTS.find((a) => a.id === id);
    if (!agent) return;
    localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(toIdentity(agent)));
    setAgentId(id);
    tracker?.identify(toIdentity(agent));
    tracker?.track(EVENTS.AgentSwitched.name, { agent_id: id });
  }

  return (
    <label className="agent-picker" data-track-id="agent_picker">
      Signed in as
      <select value={agentId} onChange={(e) => onChange(e.target.value)} aria-label="Agent">
        {SUPPORT_AGENTS.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {a.team}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'err' | 'info' | 'accent'; children: ReactNode }) {
  return <span className={`badge${tone === 'neutral' ? '' : ` badge-${tone}`}`}>{children}</span>;
}

const STATUS_TONE: Record<string, 'neutral' | 'ok' | 'warn' | 'err' | 'info' | 'accent'> = {
  placed: 'neutral',
  artwork_review: 'warn',
  in_production: 'info',
  partially_shipped: 'accent',
  shipped: 'info',
  delivered: 'ok',
  exception: 'err',
  in_transit: 'info',
  out_for_delivery: 'info',
  label_created: 'neutral',
  approved: 'ok',
  pending_review: 'warn',
  changes_requested: 'err',
  on_hold: 'err',
  done: 'ok',
  printing: 'info',
  quality_check: 'info',
  packed: 'info',
  queued: 'neutral',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Badge>;
}
