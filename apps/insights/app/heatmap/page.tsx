import { listOrders } from '@poc/mock-data';
import { clickPoints, elementStats, scrollReach } from '@poc/warehouse';
import { BarList } from '@/components/charts';
import { fmtMs } from '@/components/format';
import { HeatmapView, type ClickPoint, type ElementStat } from '@/components/HeatmapView';

export const dynamic = 'force-dynamic';

export default async function HeatmapPage() {
  const [stats, points, reach] = await Promise.all([elementStats('order_detail'), clickPoints('order_detail'), scrollReach('order_detail')]);
  const orders = listOrders().map((o) => ({ id: o.id, label: `${o.id} · ${o.lineItems.length} item${o.lineItems.length > 1 ? 's' : ''} · ${o.status.replace(/_/g, ' ')}` }));
  const pageReach = reach.filter((r) => r.container === 'page');
  const panelReach = reach.filter((r) => r.container === 'events_panel');

  return (
    <main className="page" style={{ maxWidth: 1480 }}>
      <h1>Order detail heatmaps</h1>
      <div className="subtle" style={{ marginBottom: 14 }}>
        The real order page is rendered below (tracking disabled inside the frame) and overlaid with aggregated behaviour. Clicks are stored relative to the element they hit, so the overlay
        survives different screen sizes and layouts.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 20, alignItems: 'start' }}>
        <HeatmapView stats={stats as unknown as ElementStat[]} points={points as unknown as ClickPoint[]} orders={orders} />
        <aside className="stack" style={{ position: 'sticky', top: 72 }}>
          <div className="card card-pad">
            <h3 style={{ marginBottom: 4 }}>Scroll reach · page</h3>
            <div className="subtle" style={{ marginBottom: 10 }}>% of order page views that reached each depth</div>
            <BarList max={100} data={pageReach.map((r) => ({ label: `${r.depth_pct}%`, value: r.pct_of_page_views, display: `${r.pct_of_page_views}%`, detail: `median ${fmtMs(r.median_ms_to_reach)} to reach` }))} />
          </div>
          <div className="card card-pad">
            <h3 style={{ marginBottom: 4 }}>Scroll reach · events panel</h3>
            <div className="subtle" style={{ marginBottom: 10 }}>page views that scrolled the panel to each depth</div>
            <BarList data={panelReach.map((r) => ({ label: `${r.depth_pct}%`, value: r.page_views_reached, display: `${r.page_views_reached} pv` }))} emptyText="Nobody scrolled the panel yet" />
          </div>
          <div className="card card-pad">
            <h3 style={{ marginBottom: 10 }}>Most attention</h3>
            <BarList
              data={stats
                .filter((s) => !['order_page', 'line_item.card', 'app_header', 'agent_picker', 'order_timeline'].includes(s.element_id) && (s.avg_visible_ms_per_pv ?? 0) > 0)
                .slice(0, 8)
                .map((s) => ({ label: s.element_id, value: s.avg_visible_ms_per_pv ?? 0, display: fmtMs(s.avg_visible_ms_per_pv), detail: `viewed in ${s.view_rate_pct ?? 0}% of page views` }))}
            />
          </div>
        </aside>
      </div>

      <h2 style={{ margin: '28px 0 10px' }}>Element table</h2>
      <div className="card" style={{ marginBottom: 40, overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Element</th>
              <th className="num">View rate</th>
              <th className="num">In view / pv</th>
              <th className="num">Hover / pv</th>
              <th className="num">Clicks</th>
              <th className="num">Copies</th>
              <th className="num">Selections</th>
              <th className="num">Dead</th>
              <th className="num">Rage</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.element_id}>
                <td className="mono">{s.element_id}</td>
                <td className="num">{s.view_rate_pct ?? 0}%</td>
                <td className="num">{fmtMs(s.avg_visible_ms_per_pv)}</td>
                <td className="num">{fmtMs(s.avg_hover_ms_per_pv)}</td>
                <td className="num">{s.clicks}</td>
                <td className="num">{s.copies}</td>
                <td className="num">{s.selections}</td>
                <td className="num">{s.dead_clicks}</td>
                <td className="num">{s.rage_clicks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
