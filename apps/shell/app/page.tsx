import { listOrders, summarizeOrder } from '@poc/mock-data';
import { OrderQueue } from '@/components/OrderQueue';

// Dates are relative to today, so render per request rather than at build time.
export const dynamic = 'force-dynamic';

export default function QueuePage() {
  const orders = listOrders().map(summarizeOrder);
  return (
    <main className="page">
      <OrderQueue orders={orders} />
    </main>
  );
}
