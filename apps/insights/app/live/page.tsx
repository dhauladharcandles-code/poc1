import { LiveFeed } from '@/components/LiveFeed';

export default function LivePage() {
  return (
    <main className="page" style={{ maxWidth: 1480 }}>
      <h1>Live events</h1>
      <div className="subtle" style={{ marginBottom: 14 }}>
        What the collector has received, newest first (refreshes every 2s). Open an order in another tab and watch viewability, scroll, copy and
        tab-switch events arrive.
      </div>
      <LiveFeed />
    </main>
  );
}
