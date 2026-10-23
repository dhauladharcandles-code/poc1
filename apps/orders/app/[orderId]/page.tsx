import { notFound } from 'next/navigation';
import { getOrder } from '@poc/mock-data';
import { OrderDetail } from '@/components/OrderDetail';

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orderId } = await params;
  const sp = await searchParams;
  const order = getOrder(orderId);
  if (!order) notFound();
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  return (
    <OrderDetail
      order={order}
      ticketId={one(sp.ticket)}
      ticketReason={one(sp.reason)}
      initialPanel={one(sp.events) === 'open' ? { open: true, filter: one(sp.filter) ?? 'all' } : null}
    />
  );
}
