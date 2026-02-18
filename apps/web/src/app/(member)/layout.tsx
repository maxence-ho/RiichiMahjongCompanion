import Link from 'next/link';
import type { ReactNode } from 'react';

import { SessionInfo } from '@/components/SessionInfo';

const memberNavItems = [
  { href: '/club', label: 'Club' },
  { href: '/competitions', label: 'Competitions' },
  { href: '/inbox', label: 'Inbox' }
];

export default function MemberLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="mx-auto min-h-screen max-w-5xl px-3 pb-8 pt-4">
      <header className="mb-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <h1 className="text-xl font-bold text-brand-700">Mahjong Club</h1>
        <nav className="mt-2 flex flex-wrap gap-3 text-sm">
          {memberNavItems.map((item) => (
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
  );
}
