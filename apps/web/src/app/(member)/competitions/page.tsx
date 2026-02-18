'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';

import { RequireAuth } from '@/components/RequireAuth';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthContext } from '@/features/auth/AuthProvider';
import { ensureTestAdminAccess } from '@/lib/callables';
import { db } from '@/lib/firebaseClient';

interface CompetitionItem {
  id: string;
  name: string;
  type: string;
  status: string;
}

export default function CompetitionsPage() {
  const router = useRouter();
  const { user, profile, activeClubRole } = useAuthContext();
  const [items, setItems] = useState<CompetitionItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [repairingAdmin, setRepairingAdmin] = useState(false);
  const isAdmin = activeClubRole === 'admin';
  const activeClubId = profile?.activeClubId ?? null;
  const canRepairLocalAdmin =
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true' &&
    user?.email?.trim().toLowerCase() === 'admin@mahjong.local' &&
    !isAdmin;

  useEffect(() => {
    const clubId = activeClubId;
    if (!clubId) {
      setItems([]);
      return;
    }

    getDocs(collection(db, `clubs/${clubId}/competitions`))
      .then((snapshot) =>
        setItems(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<CompetitionItem, 'id'>) })))
      )
      .catch(console.error);
  }, [activeClubId]);

  const onRepairAdminAccess = async () => {
    setRepairingAdmin(true);
    setMessage(null);
    try {
      await ensureTestAdminAccess(activeClubId ? { clubId: activeClubId } : undefined);
      setMessage('Admin access restored. Opening admin console.');
      router.push('/admin');
    } catch (error) {
      setMessage((error as { message?: string }).message ?? 'Failed to restore admin access.');
    } finally {
      setRepairingAdmin(false);
    }
  };

  return (
    <RequireAuth>
      <Card>
        <h2 className="text-lg font-semibold">Competitions</h2>
        <p className="mt-2 text-xs text-slate-600">
          Active club: <strong>{activeClubId ?? 'none'}</strong> | role:{' '}
          <strong>{activeClubRole ?? 'none'}</strong>
        </p>
        {!activeClubId ? (
          <div className="mt-3">
            <Link href="/club" className="rounded border border-slate-300 px-3 py-2 text-sm">
              Select active club
            </Link>
          </div>
        ) : null}
        {isAdmin ? (
          <div className="mt-3">
            <Link href="/admin" className="inline-flex rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white">
              Create competition
            </Link>
          </div>
        ) : null}
        {canRepairLocalAdmin ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              onClick={onRepairAdminAccess}
              disabled={repairingAdmin}
            >
              {repairingAdmin ? 'Restoring admin access...' : 'Restore admin access'}
            </button>
            <p className="text-xs text-slate-600">Local emulator helper for admin@mahjong.local.</p>
          </div>
        ) : null}
        {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
        {items.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No competitions in this club" />
          </div>
        ) : null}
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((item) => (
            <li key={item.id} className="rounded border border-slate-100 p-2">
              <Link href={`/competitions/${item.id}`} className="font-medium">
                {item.name}
              </Link>
              <p className="text-slate-600">
                {item.type} | {item.status}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </RequireAuth>
  );
}
