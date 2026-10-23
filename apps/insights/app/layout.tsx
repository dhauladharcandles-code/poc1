import type { Metadata } from 'next';
import { AppHeader } from '@poc/ui';
import '@poc/ui/styles.css';
import './insights.css';
import { SubNav } from '@/components/SubNav';

export const metadata: Metadata = { title: 'Agent insights · Printwell Support' };

// The dashboard itself is intentionally not tracked, so analyst clicks never mix with agent behaviour.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppHeader zone="insights" />
        <SubNav />
        {children}
      </body>
    </html>
  );
}
