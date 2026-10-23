import Link from 'next/link';
import {
  agents,
  awaySummary,
  copyStats,
  entryPoints,
  featureUsage,
  friction,
  inferenceAccuracy,
  leaveTriggers,
  overview,
  problemMix,
} from '@poc/warehouse';
import { BarList, PairedBars, StackedBar } from '@/components/charts';
import { fmtMs, label, pct } from '@/components/format';

export const dynamic = 'force-dynamic';

function Q({ n, title, sub }: { n: string; title: string; sub?: string }) {
  return (
    <div className="q-head">
      <span className="q">{n}</span>
      <h2>{title}</h2>
      {sub && <span className="subtle">{sub}</span>}
    </div>
  );
}

export default async function Overview() {
  const [o, problems, [acc], entries, features, copies, away, triggers, fr, ag] = await Promise.all([
    overview(),
    problemMix(),
    inferenceAccuracy(),
    entryPoints(),
    featureUsage(),
    copyStats(),
    awaySummary(),
    leaveTriggers(),
    friction(),
    agents(),
  ]);

  if (!o || o.investigations === 0) {
    return (
      <main className="page">
        <div className="card card-pad stack">
          <h1>No agent activity yet</h1>
          <p className="muted">
            Open an order from the <a href="/">order queue</a> and click around, or generate realistic sessions with{' '}
            <span className="mono">pnpm simulate</span>. Raw events will show up under <Link href="/live">Live events</Link>.
          </p>
        </div>
      </main>
    );
  }

  const awayByBucket = new Map<string, number>();
  for (const r of away) awayByBucket.set(r.away_bucket, (awayByBucket.get(r.away_bucket) ?? 0) + r.episodes);

  return (
    <main className="page">
      <div className="row-between">
        <div>
          <h1>How agents use the order detail page</h1>
          <div className="subtle">
            {o.investigations} investigations · {o.agents} agents · {o.orders} orders · {o.events.toLocaleString()} events · data from the local Segment-compatible collector, modelled in DuckDB (same SQL ships for Snowflake)
          </div>
        </div>
      </div>

      <div className="grid-4" style={{ marginTop: 18 }}>
        <div className="card kpi">
          <div className="label">Median engaged time</div>
          <div className="value">{fmtMs(o.median_engaged_ms)}</div>
          <div className="hint">per investigation (tab visible, focused, not idle)</div>
        </div>
        <div className="card kpi">
          <div className="label">Median wall-clock time</div>
          <div className="value">{fmtMs(o.median_wall_ms)}</div>
          <div className="hint">first to last event on the order</div>
        </div>
        <div className="card kpi">
          <div className="label">Left the page</div>
          <div className="value">{pct(o.pct_left_page)}</div>
          <div className="hint">of investigations switched tab or window</div>
        </div>
        <div className="card kpi">
          <div className="label">Hit friction</div>
          <div className="value">{pct(o.pct_with_friction)}</div>
          <div className="hint">rage/dead clicks, Ctrl+F or errors</div>
        </div>
      </div>

      <Q n="Why" title="What problem are agents solving?" sub="rule-based inference from behaviour vs. helpdesk ticket reason" />
      <div className="grid-2">
        <div className="card card-pad">
          <PairedBars rows={problems.map((p) => ({ label: label(p.problem), a: p.inferred, b: p.from_ticket }))} a="Inferred from behaviour" b="Ticket reason (ground truth)" />
          <div className="subtle" style={{ marginTop: 10 }}>
            Inference matches the ticket on <b>{acc?.matched ?? 0}</b> of <b>{acc?.labelled ?? 0}</b> labelled investigations ({pct(acc?.pct)}). Labelled ones come from helpdesk deep links.
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 10 }}>Median engaged time by problem</h3>
          <BarList
            data={problems.filter((p) => p.inferred > 0).map((p) => ({ label: label(p.problem), value: p.median_engaged_ms ?? 0, display: fmtMs(p.median_engaged_ms), detail: `${p.inferred} investigations · wall ${fmtMs(p.median_wall_ms)}` }))}
          />
        </div>
      </div>

      <Q n="Time" title="Where does an investigation’s time go?" />
      <div className="grid-2">
        <div className="card card-pad">
          <StackedBar
            segments={[
              { label: 'Engaged', value: o.total_engaged_ms ?? 0, color: 'var(--series-1)', display: fmtMs(o.total_engaged_ms) },
              { label: 'Away (other tab)', value: o.total_away_ms ?? 0, color: 'var(--series-2)', display: fmtMs(o.total_away_ms) },
              { label: 'Other window focused', value: o.total_blurred_ms ?? 0, color: 'var(--series-3)', display: fmtMs(o.total_blurred_ms) },
              { label: 'Idle (no input ≥60s)', value: o.total_idle_ms ?? 0, color: 'var(--series-4)', display: fmtMs(o.total_idle_ms) },
            ]}
          />
          <div className="subtle" style={{ marginTop: 12 }}>
            Away time is measured from <span className="mono">Page Left</span> → <span className="mono">Page Returned</span> (tab hidden or window blurred &gt;1s).
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 10 }}>How long agents stay away</h3>
          <BarList data={['< 10s', '10–60s', '1–5 min', '> 5 min', 'never returned'].filter((b) => awayByBucket.has(b)).map((b) => ({ label: b, value: awayByBucket.get(b) ?? 0, display: `${awayByBucket.get(b)} times` }))} emptyText="Nobody left the page yet" />
          <h3 style={{ margin: '16px 0 10px' }}>What agents did right before leaving</h3>
          <BarList data={triggers.map((t) => ({ label: t.last_action, value: t.episodes, display: `${t.episodes}`, detail: `median away ${fmtMs(t.median_away_ms)}` }))} tone="alt" emptyText="Nobody left the page yet" />
        </div>
      </div>

      <Q n="Usage" title="Which features are used?" sub="share of investigations that used each feature at least once" />
      <div className="card card-pad">
        <BarList
          max={100}
          data={features.map((f) => ({ label: f.feature, value: f.pct_investigations ?? 0, display: pct(f.pct_investigations), detail: `${f.total_uses} uses · ${f.agents} agents · median ${fmtMs(f.median_ms_to_use)} after opening the order` }))}
        />
      </div>

      <Q n="How" title="What gets copied, and what happens next?" sub="copy → leave within 15s usually means pasting into the helpdesk or a carrier site" />
      <div className="card">
        {copies.length === 0 ? (
          <div className="empty">No copies yet</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Method</th>
                <th>Detected type</th>
                <th className="num">Copies</th>
                <th className="num">Investigations</th>
                <th className="num">Left within 15s</th>
                <th className="num">Median away after</th>
              </tr>
            </thead>
            <tbody>
              {copies.map((c, i) => (
                <tr key={i}>
                  <td className="mono">{String(c.field)}</td>
                  <td>{String(c.method)}</td>
                  <td>{String(c.detected_type)}</td>
                  <td className="num">{String(c.copies)}</td>
                  <td className="num">{String(c.investigations)}</td>
                  <td className="num">{pct(c.pct_left_within_15s as number)}</td>
                  <td className="num">{fmtMs(c.median_away_ms_after as number | null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid-2" style={{ marginTop: 0 }}>
        <div>
          <Q n="Pain" title="Where agents struggle" />
          <div className="card">
            {fr.length === 0 ? (
              <div className="empty">No friction signals yet</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Signal</th>
                    <th>Element</th>
                    <th className="num">Count</th>
                    <th className="num">Inv.</th>
                  </tr>
                </thead>
                <tbody>
                  {fr.map((f, i) => (
                    <tr key={i}>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          <span aria-hidden style={{ display: 'inline-block', flex: 'none', width: 8, height: 8, borderRadius: 2, background: String(f.signal).includes('Rage') || String(f.signal).includes('Error') ? 'var(--status-critical)' : 'var(--status-serious)' }} />
                          {String(f.signal)}
                        </span>
                        {f.detail ? <div className="subtle">{label(String(f.detail))}</div> : null}
                      </td>
                      <td className="mono">{String(f.element_id)}</td>
                      <td className="num">{String(f.occurrences)}</td>
                      <td className="num">{String(f.investigations)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div>
          <Q n="How" title="Where agents come from" />
          <div className="card card-pad">
            <BarList data={entries.map((e) => ({ label: label(e.entry_point), value: e.investigations, display: `${e.investigations}`, detail: `median engaged ${fmtMs(e.median_engaged_ms)}` }))} />
          </div>
        </div>
      </div>

      <Q n="What" title="Agents" />
      <div className="card" style={{ marginBottom: 40 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Team</th>
              <th className="num">Investigations</th>
              <th className="num">Median engaged</th>
              <th className="num">Away total</th>
              <th className="num">Friction / inv.</th>
              <th className="num">Used events panel</th>
              <th className="num">Used carrier link</th>
            </tr>
          </thead>
          <tbody>
            {ag.map((a) => (
              <tr key={String(a.agent_id)}>
                <td>{String(a.agent_name ?? a.agent_id)}</td>
                <td>{label(a.team as string)}</td>
                <td className="num">{String(a.investigations)}</td>
                <td className="num">{fmtMs(a.median_engaged_ms as number)}</td>
                <td className="num">{fmtMs(a.away_ms as number)}</td>
                <td className="num">{Number(a.avg_friction ?? 0).toFixed(1)}</td>
                <td className="num">{pct(a.pct_used_events_panel as number)}</td>
                <td className="num">{pct(a.pct_used_carrier_link as number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
