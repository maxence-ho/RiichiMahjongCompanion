'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';

import { CompetitionGameProposalForm } from '@/components/CompetitionGameProposalForm';
import { GameCard } from '@/components/GameCard';
import { LeaderboardTable } from '@/components/LeaderboardTable';
import { RequireAuth } from '@/components/RequireAuth';
import { StatusBadge } from '@/components/StatusBadge';
import type { Competition, LeaderboardEntry, Rules } from '@/domain/models';
import { useAuthContext } from '@/features/auth/AuthProvider';
import { createTournamentRoundPairings, submitTournamentTableResultProposal } from '@/lib/callables';
import { db } from '@/lib/firebaseClient';

interface GameListItem {
  id: string;
  status: 'pending_validation' | 'validated' | 'disputed' | 'cancelled';
  participants: string[];
  competitionIds: string[];
  activeVersionId?: string | null;
  updatedAtMs: number;
}

interface TournamentRound {
  id: string;
  roundNumber: number;
  status: 'active' | 'completed' | 'scheduled';
  tables: Record<
    string,
    {
      tableIndex: number;
      playerIds: string[];
      status: 'awaiting_result' | 'pending_validation' | 'validated' | 'disputed';
      proposalId: string | null;
      gameId: string | null;
    }
  >;
}

const defaultRules: Rules = {
  startingPoints: 25000,
  returnPoints: 30000,
  uma: [20, 10, -10, -20],
  oka: 0,
  scoreSum: 100000,
  rounding: 'nearest_100',
  allowOpenTanyao: true,
  useRedFives: true,
  redFivesCount: { man: 1, pin: 1, sou: 1 },
  useIppatsu: true,
  useUraDora: true,
  useKanDora: true,
  useKanUraDora: true,
  headBump: false,
  agariYame: true,
  tobiEnd: true,
  honbaPoints: 300,
  notenPaymentTotal: 3000,
  riichiBetPoints: 1000
};

function resolveCompetitionRules(competition: Competition | null, clubDefaultRules: Rules): Rules {
  if (!competition?.rules || competition.rules.mode !== 'override') {
    return clubDefaultRules;
  }

  return {
    ...clubDefaultRules,
    ...(competition.rules.overrideRules ?? {})
  };
}

function tournamentTabClass(active: boolean) {
  return active
    ? 'rounded border border-brand-700 bg-brand-700 px-3 py-2 text-sm font-medium text-white'
    : 'rounded border border-slate-300 px-3 py-2 text-sm text-slate-700';
}

export default function CompetitionDetailPage() {
  const params = useParams<{ id: string }>();
  const { profile, user } = useAuthContext();

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [clubDefaultRules, setClubDefaultRules] = useState<Rules>(defaultRules);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [games, setGames] = useState<GameListItem[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [tableResultsByGameId, setTableResultsByGameId] = useState<
    Record<string, { participants: string[]; finalScores: Record<string, number> }>
  >({});
  const [rounds, setRounds] = useState<TournamentRound[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSubmittingRound, setIsSubmittingRound] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tableScores, setTableScores] = useState<Record<string, Record<string, number>>>({});
  const [tournamentTab, setTournamentTab] = useState<'overview' | 'input' | 'games'>('overview');

  const competitionId = params.id;

  const load = useCallback(async () => {
    const clubId = profile?.activeClubId;
    if (!clubId || !competitionId || !user) {
      setCompetition(null);
      setEntries([]);
      setGames([]);
      setRounds([]);
      setIsAdmin(false);
      return;
    }

    const [
      competitionSnapshot,
      clubSnapshot,
      memberSnapshot,
      membersSnapshot,
      leaderboardSnapshot,
      gamesSnapshot,
      roundsSnapshot
    ] =
      await Promise.all([
        getDoc(doc(db, `clubs/${clubId}/competitions/${competitionId}`)),
        getDoc(doc(db, `clubs/${clubId}`)),
        getDoc(doc(db, `clubs/${clubId}/members/${user.uid}`)),
        getDocs(collection(db, `clubs/${clubId}/members`)),
        getDocs(
          query(
            collection(db, 'competitionLeaderboardEntries'),
            where('clubId', '==', clubId),
            where('competitionId', '==', competitionId)
          )
        ),
        getDocs(
          query(
            collection(db, 'games'),
            where('clubId', '==', clubId),
            where('competitionIds', 'array-contains', competitionId)
          )
        ),
        getDocs(
          query(
            collection(db, 'tournamentRounds'),
            where('clubId', '==', clubId),
            where('competitionId', '==', competitionId)
          )
        )
      ]);

    if (!competitionSnapshot.exists()) {
      setCompetition(null);
      return;
    }

    setCompetition({
      id: competitionSnapshot.id,
      ...(competitionSnapshot.data() as Omit<Competition, 'id'>)
    });

    const clubRules = (clubSnapshot.data()?.defaultRules as Rules | undefined) ?? defaultRules;
    setClubDefaultRules(clubRules);

    setIsAdmin(memberSnapshot.data()?.role === 'admin');

    const mappedNames: Record<string, string> = {};
    for (const memberDoc of membersSnapshot.docs) {
      mappedNames[memberDoc.id] = (memberDoc.data()?.displayNameCache as string | undefined) ?? memberDoc.id;
    }
    setMemberNames(mappedNames);

    setEntries(
      leaderboardSnapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          userId: data.userId,
          totalPoints: data.totalPoints,
          gamesPlayed: data.gamesPlayed
        } as LeaderboardEntry;
      })
    );

    const mappedGames = gamesSnapshot.docs
      .map((docSnap) => {
        const data = docSnap.data() as any;
        return {
          id: docSnap.id,
          status: data.status,
          participants: data.participants ?? [],
          competitionIds: data.competitionIds ?? [],
          activeVersionId: data.activeVersionId ?? null,
          updatedAtMs: data.updatedAt?.toMillis?.() ?? 0
        } as GameListItem;
      })
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    setGames(mappedGames);

    const versionIdToGameId = new Map<string, string>();
    for (const gameItem of mappedGames) {
      if (gameItem.activeVersionId) {
        versionIdToGameId.set(String(gameItem.activeVersionId), gameItem.id);
      }
    }

    if (versionIdToGameId.size > 0) {
      const versionSnapshots = await Promise.all(
        [...versionIdToGameId.keys()].map((versionId) => getDoc(doc(db, `gameVersions/${versionId}`)))
      );
      const mappedResults: Record<string, { participants: string[]; finalScores: Record<string, number> }> = {};

      for (let index = 0; index < versionSnapshots.length; index += 1) {
        const snapshot = versionSnapshots[index];
        if (!snapshot.exists()) {
          continue;
        }
        const versionId = [...versionIdToGameId.keys()][index];
        const gameId = versionIdToGameId.get(versionId);
        if (!gameId) {
          continue;
        }
        mappedResults[gameId] = {
          participants: (snapshot.data().participants ?? []) as string[],
          finalScores: (snapshot.data().finalScores ?? {}) as Record<string, number>
        };
      }

      setTableResultsByGameId(mappedResults);
    } else {
      setTableResultsByGameId({});
    }

    const mappedRounds = roundsSnapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<TournamentRound, 'id'>)
    }));
    setRounds(mappedRounds);
  }, [competitionId, profile?.activeClubId, user]);

  useEffect(() => {
    load().catch((error) => {
      setMessage((error as { message?: string }).message ?? 'Failed to load competition.');
    });
  }, [load]);

  const resolvedRules = useMemo(
    () => resolveCompetitionRules(competition, clubDefaultRules),
    [clubDefaultRules, competition]
  );

  const displayName = useCallback(
    (userId: string) => {
      return memberNames[userId] ?? userId;
    },
    [memberNames]
  );

  const pendingGames = games.filter((game) => game.status === 'pending_validation').slice(0, 8);
  const validatedGames = games.filter((game) => game.status === 'validated').slice(0, 8);

  const roundsAsc = useMemo(() => [...rounds].sort((a, b) => a.roundNumber - b.roundNumber), [rounds]);
  const activeRound = rounds.find((round) => round.status === 'active') ?? null;
  const completedRounds = rounds.filter((round) => round.status === 'completed').length;
  const scheduledRounds = rounds.filter((round) => round.status === 'scheduled').length;
  const pairingAlgorithm = competition?.tournamentConfig?.pairingAlgorithm ?? 'performance_swiss';
  const isPrecomputedTournament = pairingAlgorithm === 'precomputed_min_repeats';

  const onCreateNextRound = async () => {
    if (!profile?.activeClubId || !competitionId) {
      return;
    }

    setMessage(null);
    setIsSubmittingRound(true);
    try {
      const result = await createTournamentRoundPairings({
        clubId: profile.activeClubId,
        competitionId
      });
      setMessage(`Round ${result.roundNumber} is ready.`);
      await load();
    } catch (error) {
      setMessage((error as { message?: string }).message ?? 'Failed to create tournament round.');
    } finally {
      setIsSubmittingRound(false);
    }
  };

  const onSubmitTableResult = async (roundId: string, tableIndex: number) => {
    if (!profile?.activeClubId || !competitionId) {
      return;
    }

    const key = `${roundId}:${tableIndex}`;
    const finalScores = tableScores[key] ?? {};

    setMessage(null);
    try {
      await submitTournamentTableResultProposal({
        clubId: profile.activeClubId,
        competitionId,
        roundId,
        tableIndex,
        finalScores
      });
      setMessage('Table result submitted for approval.');
      await load();
    } catch (error) {
      setMessage((error as { message?: string }).message ?? 'Failed to submit table result.');
    }
  };

  if (!competition) {
    return (
      <RequireAuth>
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
          Competition not found.
        </section>
      </RequireAuth>
    );
  }

  const isChampionship = competition.type === 'championship';
  const isTournament = competition.type === 'tournament';

  return (
    <RequireAuth>
      <section className="grid gap-3 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{competition.name}</h2>
                <p className="text-sm text-slate-600">
                  {competition.type} | status: {competition.status}
                </p>
              </div>
              {isChampionship ? (
                <Link
                  href={`/games/new?competitionId=${competition.id}&scoreSum=${resolvedRules.scoreSum}`}
                  className="rounded border border-slate-300 px-3 py-2 text-sm lg:hidden"
                >
                  Declare game (mobile)
                </Link>
              ) : null}
            </div>
            {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold">Leaderboard</h3>
            <div className="mt-3">
              <LeaderboardTable entries={entries} />
            </div>
          </div>

          {isTournament ? (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-amber-900">Approval gate</h3>
                  <button
                    className="rounded border border-amber-300 bg-white px-3 py-1 text-sm text-amber-900"
                    onClick={() => setTournamentTab('games')}
                  >
                    Open games tab
                  </button>
                </div>
                <p className="mt-1 text-sm text-amber-800">
                  Pending games must be approved before progressing to the next round.
                </p>
                <p className="mt-1 text-sm font-medium text-amber-900">
                  Pending approvals: {pendingGames.length}
                </p>
                <div className="mt-2 space-y-1">
                  {pendingGames.slice(0, 3).map((game) => (
                    <GameCard
                      key={game.id}
                      id={game.id}
                      participants={game.participants}
                      status={game.status}
                      competitionIds={game.competitionIds}
                    />
                  ))}
                  {pendingGames.length === 0 ? <p className="text-sm text-amber-800">No pending games.</p> : null}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">Tournament navigation</h3>
                  {isAdmin ? (
                    <button
                      className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                      onClick={onCreateNextRound}
                      disabled={isSubmittingRound || activeRound != null || competition.status !== 'active'}
                    >
                      {isPrecomputedTournament
                        ? rounds.length === 0
                          ? 'Initialize full schedule'
                          : 'Start next scheduled round'
                        : 'Create next round'}
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className={tournamentTabClass(tournamentTab === 'overview')}
                    onClick={() => setTournamentTab('overview')}
                  >
                    Overview
                  </button>
                  <button
                    className={tournamentTabClass(tournamentTab === 'games')}
                    onClick={() => setTournamentTab('games')}
                  >
                    Games
                  </button>
                  <button
                    className={tournamentTabClass(tournamentTab === 'input')}
                    onClick={() => setTournamentTab('input')}
                  >
                    Round input
                  </button>
                </div>
              </div>

              {tournamentTab === 'overview' ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-base font-semibold">Tournament overview</h3>
                  <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <p>Total rounds configured: {competition.tournamentConfig?.totalRounds ?? '-'}</p>
                    <p>Completed rounds: {completedRounds}</p>
                    <p>Scheduled rounds: {scheduledRounds}</p>
                    <p>Active round: {activeRound ? `#${activeRound.roundNumber}` : 'none'}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Pairing algorithm:{' '}
                    {isPrecomputedTournament ? 'precomputed min repeat encounters' : 'between rounds (performance-based)'}
                  </p>

                  <div className="mt-3">
                    <h4 className="text-sm font-semibold">Rounds, tables and scores</h4>
                    <div className="mt-2 space-y-2">
                      {roundsAsc.length === 0 ? <p className="text-sm text-slate-600">No rounds yet.</p> : null}
                      {roundsAsc.map((round) => (
                        <article key={round.id} className="rounded border border-slate-100 p-3">
                          <p className="text-sm font-semibold">
                            Round {round.roundNumber} | <StatusBadge status={round.status} />
                          </p>
                          <div className="mt-2 space-y-2">
                            {Object.values(round.tables)
                              .sort((a, b) => a.tableIndex - b.tableIndex)
                              .map((table) => {
                                const tableResult = table.gameId ? tableResultsByGameId[table.gameId] : undefined;
                                return (
                                  <div key={`${round.id}_${table.tableIndex}`} className="rounded border border-slate-100 p-2">
                                    <p className="text-sm font-medium">
                                      Table {table.tableIndex + 1} | <StatusBadge status={table.status} />
                                    </p>
                                    <div className="mt-2 overflow-x-auto">
                                      <table className="min-w-full text-sm">
                                        <thead>
                                          <tr className="text-left text-slate-500">
                                            <th className="pr-4">Player</th>
                                            <th>Score</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {(tableResult?.participants ?? table.playerIds).map((playerId) => (
                                            <tr key={`${round.id}_${table.tableIndex}_${playerId}`} className="border-t border-slate-100">
                                              <td className="py-1 pr-4">{displayName(playerId)}</td>
                                              <td className="py-1">
                                                {tableResult?.finalScores?.[playerId] != null
                                                  ? tableResult.finalScores[playerId]
                                                  : '-'}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {tournamentTab === 'input' ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-base font-semibold">Active round input</h3>
                  {activeRound ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm text-slate-700">
                        Round #{activeRound.roundNumber} is active. Submit each table result for approval.
                      </p>
                      {Object.values(activeRound.tables)
                        .sort((a, b) => a.tableIndex - b.tableIndex)
                        .map((table) => {
                          const key = `${activeRound.id}:${table.tableIndex}`;
                          return (
                            <div key={key} className="rounded border border-slate-100 p-3">
                              <p className="text-sm font-medium">
                                Table {table.tableIndex + 1} | <StatusBadge status={table.status} />
                              </p>
                              <p className="mt-1 text-sm text-slate-700">
                                Players: {table.playerIds.map((playerId) => displayName(playerId)).join(', ')}
                              </p>
                              {(table.status === 'awaiting_result' ||
                                table.status === 'disputed' ||
                                table.status === 'pending_validation') && (
                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                  {table.playerIds.map((playerId) => (
                                    <label key={playerId} className="text-xs">
                                      <span className="mb-1 block">{displayName(playerId)}</span>
                                      <input
                                        className="w-full rounded border border-slate-300 p-2 text-sm"
                                        type="number"
                                        value={tableScores[key]?.[playerId] ?? ''}
                                        onChange={(event) =>
                                          setTableScores((current) => ({
                                            ...current,
                                            [key]: {
                                              ...(current[key] ?? {}),
                                              [playerId]: Number(event.target.value)
                                            }
                                          }))
                                        }
                                      />
                                    </label>
                                  ))}
                                  <button
                                    className="rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white sm:col-span-2"
                                    onClick={() => onSubmitTableResult(activeRound.id, table.tableIndex)}
                                  >
                                    {table.status === 'pending_validation'
                                      ? 'Resubmit and restart approval'
                                      : 'Submit table result'}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-600">No active round.</p>
                  )}
                </div>
              ) : null}

              {tournamentTab === 'games' ? (
                <>
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <h3 className="text-base font-semibold">Games pending approval</h3>
                    <div className="mt-2 space-y-2">
                      {pendingGames.length === 0 ? <p className="text-sm text-slate-600">No pending games.</p> : null}
                      {pendingGames.map((game) => (
                        <GameCard
                          key={game.id}
                          id={game.id}
                          participants={game.participants}
                          status={game.status}
                          competitionIds={game.competitionIds}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <h3 className="text-base font-semibold">Latest validated games</h3>
                    <div className="mt-2 space-y-2">
                      {validatedGames.length === 0 ? (
                        <p className="text-sm text-slate-600">No validated games yet.</p>
                      ) : null}
                      {validatedGames.map((game) => (
                        <GameCard
                          key={game.id}
                          id={game.id}
                          participants={game.participants}
                          status={game.status}
                          competitionIds={game.competitionIds}
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {isChampionship ? (
            <>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-base font-semibold">Games pending approval</h3>
                <div className="mt-2 space-y-2">
                  {pendingGames.length === 0 ? <p className="text-sm text-slate-600">No pending games.</p> : null}
                  {pendingGames.map((game) => (
                    <GameCard
                      key={game.id}
                      id={game.id}
                      participants={game.participants}
                      status={game.status}
                      competitionIds={game.competitionIds}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-base font-semibold">Latest validated games</h3>
                <div className="mt-2 space-y-2">
                  {validatedGames.length === 0 ? <p className="text-sm text-slate-600">No validated games yet.</p> : null}
                  {validatedGames.map((game) => (
                    <GameCard
                      key={game.id}
                      id={game.id}
                      participants={game.participants}
                      status={game.status}
                      competitionIds={game.competitionIds}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>

        <aside className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold">Competition rules</h3>
            <div className="mt-2 grid gap-2 text-sm">
              <p>Starting points: {resolvedRules.startingPoints}</p>
              <p>Return points: {resolvedRules.returnPoints}</p>
              <p>UMA: {resolvedRules.uma.join(' / ')}</p>
              <p>OKA: {resolvedRules.oka}</p>
              <p>Score sum: {resolvedRules.scoreSum}</p>
              <p>Rounding: {resolvedRules.rounding}</p>
              <p>Aka dora: {resolvedRules.useRedFives ? 'enabled' : 'disabled'}</p>
              <p>Ippatsu: {resolvedRules.useIppatsu ? 'enabled' : 'disabled'}</p>
              <p>Ura dora: {resolvedRules.useUraDora ? 'enabled' : 'disabled'}</p>
              <p>Kan dora: {resolvedRules.useKanDora ? 'enabled' : 'disabled'}</p>
              <p>Kan ura dora: {resolvedRules.useKanUraDora ? 'enabled' : 'disabled'}</p>
              <p>Open tanyao: {resolvedRules.allowOpenTanyao ? 'enabled' : 'disabled'}</p>
              <p>Head bump: {resolvedRules.headBump ? 'enabled' : 'disabled'}</p>
              <p>Agari-yame: {resolvedRules.agariYame ? 'enabled' : 'disabled'}</p>
              <p>Tobi end: {resolvedRules.tobiEnd ? 'enabled' : 'disabled'}</p>
              <p>Honba points: {resolvedRules.honbaPoints}</p>
              <p>Noten payment total: {resolvedRules.notenPaymentTotal}</p>
              <p>Riichi stick points: {resolvedRules.riichiBetPoints}</p>
            </div>
          </div>

          {isTournament ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <p className="font-semibold">Tournament quick stats</p>
              <p className="mt-2">Participants: {(competition.tournamentConfig?.participantUserIds ?? []).length}</p>
              <p>Total rounds: {competition.tournamentConfig?.totalRounds ?? '-'}</p>
              <p>Completed rounds: {completedRounds}</p>
              <p>Scheduled rounds: {scheduledRounds}</p>
              <p>Active round: {activeRound ? `#${activeRound.roundNumber}` : 'none'}</p>
            </div>
          ) : null}

          {isChampionship && profile?.activeClubId ? (
            <div className="hidden lg:block rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold">Declare game</h3>
              <p className="mt-1 text-sm text-slate-600">Submit game directly in this championship.</p>
              <div className="mt-3">
                <CompetitionGameProposalForm
                  clubId={profile.activeClubId}
                  competitionId={competition.id}
                  expectedScoreSum={resolvedRules.scoreSum}
                  onSubmitted={load}
                />
              </div>
            </div>
          ) : null}
        </aside>
      </section>
    </RequireAuth>
  );
}
