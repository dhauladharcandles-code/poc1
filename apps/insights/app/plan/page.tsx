import { EVENTS, type PlannedEvent } from '@poc/tracker/plan';
import { eventVolume } from '@poc/warehouse';
import { Badge } from '@poc/ui';

export const dynamic = 'force-dynamic';

const Q_LABEL: Record<string, string> = { what: 'What', how: 'How', why: 'Why', time: 'Time', pain: 'Pain', usage: 'Usage' };

export default async function PlanPage() {
  const volume = new Map((await eventVolume()).map((r) => [r.event, r.n]));
  const events = Object.values(EVENTS) as PlannedEvent[];
  return (
    <main className="page">
      <h1>Tracking plan</h1>
      <div className="subtle" style={{ marginBottom: 14 }}>
        Every event the tracker emits, which question it answers, and how many the collector has received. Generated from{' '}
        <span className="mono">packages/tracker/src/tracking-plan.ts</span>, which also maps 1:1 to a Segment Protocols tracking plan.
      </div>
      <div className="card" style={{ overflowX: 'auto', marginBottom: 40 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Source</th>
              <th>Answers</th>
              <th>Why it exists</th>
              <th>Key properties</th>
              <th className="num">Received</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.name}>
                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{e.name}</td>
                <td>
                  <Badge tone={e.source === 'auto' ? 'info' : 'accent'}>{e.source === 'auto' ? 'automatic' : 'app code'}</Badge>
                </td>
                <td>
                  <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                    {e.questions.map((q) => (
                      <Badge key={q}>{Q_LABEL[q]}</Badge>
                    ))}
                  </div>
                </td>
                <td className="muted" style={{ maxWidth: 420 }}>{e.description}</td>
                <td className="mono" style={{ fontSize: 11.5, maxWidth: 260 }}>{e.props.join(', ')}</td>
                <td className="num">{volume.get(e.name) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
