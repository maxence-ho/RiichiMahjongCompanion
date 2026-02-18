'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';

import { RequireAuth } from '@/components/RequireAuth';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthContext } from '@/features/auth/AuthProvider';
import { db } from '@/lib/firebaseClient';

interface CompetitionItem {
  id: string;
  name: string;
  type: string;
  status: string;
}

export default function CompetitionsPage() {
  const { profile } = useAuthContext();
  const [items, setItems] = useState<CompetitionItem[]>([]);

  useEffect(() => {
    const clubId = profile?.activeClubId;
    if (!clubId) {
      setItems([]);
      return;
    }

    getDocs(collection(db, `clubs/${clubId}/competitions`))
      .then((snapshot) =>
        setItems(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<CompetitionItem, 'id'>) })))
      )
      .catch(console.error);
  }, [profile?.activeClubId]);

  return (
    <RequireAuth>
      <Card>
        <h2 className="text-lg font-semibold">Competitions</h2>
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
