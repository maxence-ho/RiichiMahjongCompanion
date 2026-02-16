'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

import { useAuthContext } from '@/features/auth/AuthProvider';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthContext();

  if (loading) {
    return <p className="p-4 text-sm text-slate-600">Loading session...</p>;
  }

  if (!user) {
    return (
      <div className="p-4">
        <p className="text-sm text-slate-700">Please sign in first.</p>
        <Link href="/login" className="text-sm underline">
          Go to login
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
