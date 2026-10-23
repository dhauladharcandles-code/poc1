/** Fixed time zone so server- and client-rendered dates always match. */
const TZ = 'America/New_York';

const dateTime = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const dateOnly = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function fmtDateTime(iso?: string): string {
  return iso ? `${dateTime.format(new Date(iso))} ET` : '—';
}

export function fmtDate(iso?: string): string {
  return iso ? dateOnly.format(new Date(iso)) : '—';
}

export function fmtMoney(n: number): string {
  return money.format(n);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}
