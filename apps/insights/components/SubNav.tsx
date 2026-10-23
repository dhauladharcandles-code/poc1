'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Overview' },
  { href: '/heatmap', label: 'Heatmaps' },
  { href: '/investigations', label: 'Investigations & replay' },
  { href: '/live', label: 'Live events' },
  { href: '/plan', label: 'Tracking plan' },
];

export function SubNav() {
  const path = usePathname();
  return (
    <div className="subnav">
      <div className="subnav-inner">
        {TABS.map((t) => {
          const active = t.href === '/' ? path === '/' : path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className="subnav-link" aria-current={active ? 'page' : undefined}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
