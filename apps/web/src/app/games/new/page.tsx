'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { CompetitionGameProposalForm } from '@/components/CompetitionGameProposalForm';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuthContext } from '@/features/auth/AuthProvider';

function NewGamePageContent() {
  const { profile } = useAuthContext();
  const searchParams = useSearchParams();

  const competitionId = searchParams.get('competitionId');
  const scoreSumParam = Number(searchParams.get('scoreSum') ?? 100000);

  return (
    <RequireAuth>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Declare game in competition</h2>
        {!competitionId || !profile?.activeClubId ? (
          <div className="mt-3 text-sm text-slate-700">
            <p>Game declaration is only available from a competition page.</p>
            <Link href="/competitions" className="mt-2 inline-block underline">
              Go to competitions
            </Link>
          </div>
        ) : (
          <div className="mt-3">
            <CompetitionGameProposalForm
              clubId={profile.activeClubId}
              competitionId={competitionId}
              expectedScoreSum={Number.isFinite(scoreSumParam) ? scoreSumParam : 100000}
            />
          </div>
        )}
      </section>
    </RequireAuth>
  );
}

export default function NewGamePage() {
  return (
    <Suspense fallback={<div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">Loading...</div>}>
      <NewGamePageContent />
    </Suspense>
  );
}
