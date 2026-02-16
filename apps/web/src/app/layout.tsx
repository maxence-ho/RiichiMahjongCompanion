import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import './globals.css';
import { Providers } from '@/app/providers';
import { SessionInfo } from '@/components/SessionInfo';

export const metadata: Metadata = {
  title: 'Mahjong Club',
  description: 'Mahjong club competitions, games and validation workflow',
  manifest: '/manifest.webmanifest'
};

const navItems = [
  { href: '/club', label: 'Club' },
  { href: '/competitions', label: 'Competitions' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/admin', label: 'Admin' }
];

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="mx-auto min-h-screen max-w-5xl px-3 pb-8 pt-4">
            <header className="mb-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <h1 className="text-xl font-bold text-brand-700">Mahjong Club</h1>
              <nav className="mt-2 flex flex-wrap gap-3 text-sm">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-2">
                <SessionInfo />
              </div>
            </header>
            <main>{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
