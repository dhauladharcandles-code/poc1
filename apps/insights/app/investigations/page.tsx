import Link from 'next/link';
import { investigationsList } from '@poc/warehouse';
import { Badge } from '@poc/ui';
import { fmtMs, label } from '@/components/format';

export const dynamic = 'force-dynamic';

const fmtTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default async function InvestigationsPage() {
  const rows = await investigationsList();
  return (
    <main className="page">
      <h1>Investigations</h1>
      <div className="subtle" style={{ marginBottom: 14 }}>
        One row per agent × order × 30-minute activity window. Open one to see the step-by-step journey and its session replay.
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        {rows.length === 0 ? (
          <div className="empty">No investigations yet — open an order or run <span className="mono">pnpm simulate</span>.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Started (ET)</th>
                <th>Agent</th>
                <th>Order</th>
                <th>Entry</th>
                <th>Inferred problem</th>
                <th>Ticket reason</th>
                <th className="num">Engaged</th>
                <th className="num">Away</th>
                <th className="num">Copies</th>
                <th className="num">Friction</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const match = r.ticket_problem ? r.ticket_problem === r.inferred_problem : null;
                return (
                  <tr key={String(r.investigation_id)}>
                    <td>
                      <Link href={`/investigations/${r.investigation_id}`}>{r.started_at ? fmtTime.format(new Date(String(r.started_at))) : '—'}</Link>
                    </td>
                    <td>{String(r.agent_name ?? r.agent_id ?? '—')}</td>
                    <td className="mono">{String(r.order_id)}</td>
                    <td>{label(r.entry_point as string)}</td>
                    <td>{label(r.inferred_problem as string)}</td>
                    <td>
                      {r.ticket_reason ? (
                        <span className="row" style={{ gap: 6 }}>
                          {label(r.ticket_reason as string)}
                          <Badge tone={match ? 'ok' : 'warn'}>{match ? '✓ match' : '✗ differs'}</Badge>
                        </span>
                      ) : (
                        <span className="subtle">—</span>
                      )}
                    </td>
                    <td className="num">{fmtMs(r.engaged_ms as number)}</td>
                    <td className="num">{fmtMs(r.away_ms as number)}</td>
                    <td className="num">{String(r.copies)}</td>
                    <td className="num">{Number(r.friction_signals) > 0 ? <Badge tone="err">{String(r.friction_signals)}</Badge> : '0'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
