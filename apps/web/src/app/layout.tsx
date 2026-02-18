import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import { Providers } from '@/app/providers';

export const metadata: Metadata = {
  title: 'Mahjong Club',
  description: 'Mahjong club competitions, games and validation workflow',
  manifest: '/manifest.webmanifest'
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
