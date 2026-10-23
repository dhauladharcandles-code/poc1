import type { Metadata } from 'next';
import { AppHeader } from '@poc/ui';
import { TrackerInspector, TrackerProvider } from '@poc/tracker/react';
import '@poc/ui/styles.css';
import './orders.css';

export const metadata: Metadata = { title: 'Order · Printwell Support' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TrackerProvider zone="orders">
          <AppHeader zone="orders" />
          {children}
          <TrackerInspector />
        </TrackerProvider>
      </body>
    </html>
  );
}
