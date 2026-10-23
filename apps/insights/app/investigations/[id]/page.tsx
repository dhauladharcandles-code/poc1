import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasReplay, investigation, investigationEvents } from '@poc/warehouse';
import { Badge } from '@poc/ui';
import { StackedBar } from '@/components/charts';
import { fmtMs, label } from '@/components/format';
import { Journey, type JourneyEvent } from '@/components/Journey';
import { ReplayPlayer } from '@/components/ReplayPlayer';

export const dynamic = 'force-dynamic';

export default async function InvestigationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await investigation(id);
  if (!inv) notFound();
  const events = (await investigationEvents(id)) as unknown as JourneyEvent[];
  const replays = [...new Set(events.map((e) => e.replay_id).filter(Boolean))].filter((r) => hasReplay(r!)) as string[];
  const n = (k: string) => Number(inv[k] ?? 0);

  return (
    <main className="page">
      <div className="crumbs subtle" style={{ marginBottom: 10 }}>
        <Link href="/investigations">← Investigations</Link>
      </div>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1>
            {String(inv.agent_name ?? inv.agent_id)} on <span className="mono">{String(inv.order_id)}</span>
          </h1>
          <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <Badge tone="accent">inferred: {label(inv.inferred_problem as string)}</Badge>
            {inv.ticket_reason ? <Badge tone="info">ticket {String(inv.ticket_id)}: {label(inv.ticket_reason as string)}</Badge> : <Badge>no ticket</Badge>}
            <Badge>entry: {label(inv.entry_point as string)}</Badge>
            <Badge>order status: {label(inv.order_status as string)}</Badge>
            <Badge>{n('tabs')} tab(s) · {n('page_views')} page view(s)</Badge>
          </div>
        </div>
      </div>

      <div className="grid-4" style={{ marginTop: 16 }}>
        <div className="card kpi">
          <div className="label">Engaged</div>
          <div className="value">{fmtMs(n('engaged_ms'))}</div>
          <div className="hint">wall clock {fmtMs(n('wall_ms'))}</div>
        </div>
        <div className="card kpi">
          <div className="label">Left the page</div>
          <div className="value">{n('leaves')}×</div>
          <div className="hint">away {fmtMs(n('away_ms'))}{inv.copy_then_leave ? ' · left right after copying' : ''}</div>
        </div>
        <div className="card kpi">
          <div className="label">Copies</div>
          <div className="value">{n('copies')}</div>
          <div className="hint">{[inv.copied_tracking && 'tracking #', inv.copied_address && 'address', inv.copied_order_id && 'order id'].filter(Boolean).join(', ') || '—'}</div>
        </div>
        <div className="card kpi">
          <div className="label">Friction signals</div>
          <div className="value">{n('friction_signals')}</div>
          <div className="hint">
            {n('rage_clicks')} rage · {n('dead_clicks')} dead · {n('find_in_page')} Ctrl+F · {n('errors')} errors
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <StackedBar
          segments={[
            { label: 'Engaged', value: n('engaged_ms'), color: 'var(--series-1)', display: fmtMs(n('engaged_ms')) },
            { label: 'Away (other tab)', value: n('away_ms'), color: 'var(--series-2)', display: fmtMs(n('away_ms')) },
            { label: 'Other window focused', value: n('blurred_ms'), color: 'var(--series-3)', display: fmtMs(n('blurred_ms')) },
            { label: 'Idle', value: n('idle_ms'), color: 'var(--series-4)', display: fmtMs(n('idle_ms')) },
          ]}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)', gap: 20, marginTop: 20, alignItems: 'start' }}>
        <div className="card card-pad">
          <h2 style={{ marginBottom: 10 }}>Journey</h2>
          <Journey events={events} />
        </div>
        <div className="card card-pad replay-box" style={{ position: 'sticky', top: 72 }}>
          <h2 style={{ marginBottom: 4 }}>Session replay</h2>
          <div className="subtle" style={{ marginBottom: 10 }}>
            rrweb recording (open-source stand-in for New Relic Session Replay). Customer names, addresses and messages are masked at capture.
          </div>
          {replays.length ? <ReplayPlayer replayIds={replays} /> : <div className="empty">No replay recorded for this investigation.</div>}
        </div>
      </div>
    </main>
  );
}
