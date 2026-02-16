'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';

import { RequireAuth } from '@/components/RequireAuth';
import { useAuthContext } from '@/features/auth/AuthProvider';
import { db } from '@/lib/firebaseClient';

interface CompetitionCard {
  id: string;
  name: string;
  type: 'tournament' | 'championship';
}

interface ClubOption {
  id: string;
  name: string;
}

export default function ClubPage() {
  const { user, profile } = useAuthContext();
  const [competitions, setCompetitions] = useState<CompetitionCard[]>([]);
  const [pending, setPending] = useState(0);
  const [clubOptions, setClubOptions] = useState<ClubOption[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!profile?.clubIds?.length) {
      setClubOptions([]);
      return;
    }

    Promise.all(profile.clubIds.map((clubId) => getDoc(doc(db, `clubs/${clubId}`))))
      .then((snapshots) => {
        setClubOptions(
          snapshots
            .filter((snapshot) => snapshot.exists())
            .map((snapshot) => ({ id: snapshot.id, name: snapshot.data().name as string }))
        );
      })
      .catch(console.error);
  }, [profile?.clubIds]);

  useEffect(() => {
    const clubId = profile?.activeClubId;
    if (!clubId || !user) {
      setCompetitions([]);
      setPending(0);
      setIsAdmin(false);
      return;
    }

    const load = async () => {
      const [competitionSnapshot, inboxSnapshot, memberSnapshot] = await Promise.all([
        getDocs(query(collection(db, `clubs/${clubId}/competitions`), where('status', '==', 'active'))),
        getDocs(query(collection(db, 'validationRequests'), where('userId', '==', user.uid), where('clubId', '==', clubId))),
        getDoc(doc(db, `clubs/${clubId}/members/${user.uid}`))
      ]);

      setCompetitions(
        competitionSnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<CompetitionCard, 'id'>)
        }))
      );

      const pendingCount = inboxSnapshot.docs.filter((docSnap) => docSnap.data().status === 'pending').length;
      setPending(pendingCount);
      setIsAdmin(memberSnapshot.data()?.role === 'admin');
    };

    load().catch(console.error);
  }, [profile?.activeClubId, user]);

  const onChangeActiveClub = async (clubId: string) => {
    if (!user) {
      return;
    }

    await updateDoc(doc(db, `users/${user.uid}`), { activeClubId: clubId });
  };

  return (
    <RequireAuth>
      <section className="grid gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Club Dashboard</h2>
          <p className="mt-1 text-sm text-slate-700">
            Active club: <strong>{profile?.activeClubId ?? 'none selected'}</strong>
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-sm">Switch active club:</label>
            <select
              className="rounded border border-slate-300 px-2 py-1 text-sm"
              value={profile?.activeClubId ?? ''}
              onChange={(event) => onChangeActiveClub(event.target.value)}
            >
              <option value="" disabled>
                Select a club
              </option>
              {clubOptions.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/competitions" className="rounded border border-slate-300 px-3 py-2 text-sm">
              Competitions
            </Link>
            <Link href="/inbox" className="rounded border border-slate-300 px-3 py-2 text-sm">
              A valider ({pending})
            </Link>
            {isAdmin ? (
              <Link href="/admin" className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white">
                Admin
              </Link>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold">Competitions actives</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {competitions.length === 0 ? <li className="text-slate-600">No active competition.</li> : null}
            {competitions.map((competition) => (
              <li key={competition.id}>
                <Link href={`/competitions/${competition.id}`} className="font-medium">
                  {competition.name}
                </Link>{' '}
                <span className="text-slate-500">({competition.type})</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </RequireAuth>
  );
}
