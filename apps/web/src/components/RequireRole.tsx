'use client';

import { type ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuthContext } from '@/features/auth/AuthProvider';

interface RequireRoleProps {
  role: 'admin' | 'member';
  fallbackHref?: string;
  children: ReactNode;
}

export function RequireRole({ role, fallbackHref = '/club', children }: RequireRoleProps) {
  const { user, loading, activeClubRole, activeClubRoleLoading } = useAuthContext();
  const router = useRouter();

  const waiting = loading || activeClubRoleLoading;
  const hasRequiredRole = activeClubRole === role;

  useEffect(() => {
    if (waiting) {
      return;
    }

    if (!user) {
      router.replace('/login');
      return;
    }

    if (!hasRequiredRole) {
      router.replace(fallbackHref);
    }
  }, [fallbackHref, hasRequiredRole, router, user, waiting]);

  if (waiting || !user || !hasRequiredRole) {
    return <p className="p-4 text-sm text-slate-600">Redirecting...</p>;
  }

  return <>{children}</>;
}
