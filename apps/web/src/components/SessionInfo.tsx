'use client';

import { useAuthContext } from '@/features/auth/AuthProvider';

export function SessionInfo() {
  const { user, profile, loading } = useAuthContext();

  if (loading) {
    return <p className="text-xs text-slate-500">Session: loading...</p>;
  }

  if (!user) {
    return <p className="text-xs text-slate-500">Session: not connected</p>;
  }

  const name = profile?.displayName ?? user.displayName ?? user.email ?? user.uid;

  return (
    <p className="text-xs text-slate-600">
      Connected as <span className="font-semibold text-slate-800">{name}</span> ({user.email ?? user.uid})
    </p>
  );
}
