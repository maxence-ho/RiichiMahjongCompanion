import Link from 'next/link';
import type { ReactNode } from 'react';

import { SessionInfo } from '@/components/SessionInfo';

export default function AdminLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="mx-auto min-h-screen max-w-6xl px-3 pb-8 pt-4">
      <header className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-amber-900">Mahjong Admin Console</h1>
          <nav className="flex flex-wrap gap-3 text-sm">
            <Link href="/admin">Admin Home</Link>
            <Link href="/club">Member App</Link>
          </nav>
        </div>
        <div className="mt-2">
          <SessionInfo />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
