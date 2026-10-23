import type { Metadata } from 'next';
import { AppHeader } from '@poc/ui';
import { TrackerInspector, TrackerProvider } from '@poc/tracker/react';
import '@poc/ui/styles.css';

export const metadata: Metadata = { title: 'Order queue · Printwell Support' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TrackerProvider zone="shell">
          <AppHeader zone="shell" />
          {children}
          <TrackerInspector />
        </TrackerProvider>
      </body>
    </html>
  );
}
