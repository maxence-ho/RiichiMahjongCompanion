'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';

import { RequireAuth } from '@/components/RequireAuth';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuthContext } from '@/features/auth/AuthProvider';
import { approveProposal, rejectProposal } from '@/lib/callables';
import { registerPushToken } from '@/lib/firebaseMessaging';
import { db } from '@/lib/firebaseClient';

interface ValidationRequest {
  id: string;
  proposalId: string;
  gameId: string;
  type: 'game_create' | 'game_edit';
  status: 'pending' | 'approved' | 'rejected';
  title: string;
  subtitle: string;
  createdAtMs: number;
}

export default function InboxPage() {
  const { user, profile } = useAuthContext();
  const [requests, setRequests] = useState<ValidationRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !profile?.activeClubId) {
      setRequests([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const inboxQuery = query(
        collection(db, 'validationRequests'),
        where('userId', '==', user.uid),
        where('clubId', '==', profile.activeClubId)
      );
      const snapshot = await getDocs(inboxQuery);

      const baseRequests = snapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          proposalId: (docSnap.data().proposalId as string | undefined) ?? docSnap.id.replace(`_${user.uid}`, ''),
          gameId: docSnap.data().gameId,
          type: docSnap.data().type,
          status: docSnap.data().status,
          createdAtMs: docSnap.data().createdAt?.toMillis?.() ?? 0
        }))
        .sort((a, b) => {
          const aPending = a.status === 'pending' ? 0 : 1;
          const bPending = b.status === 'pending' ? 0 : 1;
          return aPending - bPending || b.createdAtMs - a.createdAtMs;
        }) as Array<
        Omit<ValidationRequest, 'title' | 'subtitle'>
      >;

      if (baseRequests.length === 0) {
        setRequests([]);
        return;
      }

      const gameIds = [...new Set(baseRequests.map((request) => request.gameId).filter(Boolean))];
      const proposalIds = [...new Set(baseRequests.map((request) => request.proposalId).filter(Boolean))];

      const [gameSnapshots, proposalSnapshots] = await Promise.all([
        Promise.all(gameIds.map((gameId) => getDoc(doc(db, `games/${gameId}`)))),
        Promise.all(proposalIds.map((proposalId) => getDoc(doc(db, `editProposals/${proposalId}`))))
      ]);

      const gameMap = new Map<string, any>();
      for (const gameSnapshot of gameSnapshots) {
        if (gameSnapshot.exists()) {
          gameMap.set(gameSnapshot.id, gameSnapshot.data());
        }
      }

      const proposalMap = new Map<string, any>();
      for (const proposalSnapshot of proposalSnapshots) {
        if (proposalSnapshot.exists()) {
          proposalMap.set(proposalSnapshot.id, proposalSnapshot.data());
        }
      }

      const participantIds = new Set<string>();
      const competitionIds = new Set<string>();
      const roundIds = new Set<string>();

      for (const request of baseRequests) {
        const gameData = gameMap.get(request.gameId);
        const proposalData = proposalMap.get(request.proposalId);

        for (const userId of gameData?.participants ?? proposalData?.proposedVersion?.participants ?? []) {
          participantIds.add(String(userId));
        }

        const competitionId =
          gameData?.competitionIds?.[0] ?? proposalData?.proposedVersion?.competitionIds?.[0] ?? null;
        if (competitionId) {
          competitionIds.add(String(competitionId));
        }

        const tournamentContext = gameData?.tournamentContext ?? proposalData?.tournamentContext;
        if (tournamentContext?.roundId) {
          roundIds.add(String(tournamentContext.roundId));
        }
      }

      const [memberSnapshots, competitionSnapshots, roundSnapshots] = await Promise.all([
        Promise.all(
          [...participantIds].map((participantId) =>
            getDoc(doc(db, `clubs/${profile.activeClubId}/members/${participantId}`))
          )
        ),
        Promise.all(
          [...competitionIds].map((competitionId) =>
            getDoc(doc(db, `clubs/${profile.activeClubId}/competitions/${competitionId}`))
          )
        ),
        Promise.all([...roundIds].map((roundId) => getDoc(doc(db, `tournamentRounds/${roundId}`))))
      ]);

      const memberNameMap = new Map<string, string>();
      const participantList = [...participantIds];
      for (let i = 0; i < memberSnapshots.length; i += 1) {
        const snapshot = memberSnapshots[i];
        const participantId = participantList[i];
        memberNameMap.set(participantId, (snapshot.data()?.displayNameCache as string | undefined) ?? participantId);
      }

      const competitionNameMap = new Map<string, string>();
      const competitionList = [...competitionIds];
      for (let i = 0; i < competitionSnapshots.length; i += 1) {
        const snapshot = competitionSnapshots[i];
        const competitionId = competitionList[i];
        competitionNameMap.set(competitionId, (snapshot.data()?.name as string | undefined) ?? competitionId);
      }

      const roundNumberMap = new Map<string, number>();
      const roundList = [...roundIds];
      for (let i = 0; i < roundSnapshots.length; i += 1) {
        const snapshot = roundSnapshots[i];
        const roundId = roundList[i];
        roundNumberMap.set(roundId, Number(snapshot.data()?.roundNumber ?? 0));
      }

      const mappedRequests = baseRequests.map((request) => {
        const gameData = gameMap.get(request.gameId);
        const proposalData = proposalMap.get(request.proposalId);

        const participants =
          (gameData?.participants as string[] | undefined) ??
          (proposalData?.proposedVersion?.participants as string[] | undefined) ??
          [];

        const participantLabel = participants
          .map((participantId) => memberNameMap.get(participantId) ?? participantId)
          .join(' / ');

        const competitionId =
          gameData?.competitionIds?.[0] ?? proposalData?.proposedVersion?.competitionIds?.[0] ?? null;
        const competitionLabel = competitionId
          ? competitionNameMap.get(String(competitionId)) ?? String(competitionId)
          : 'No competition';

        const tournamentContext = gameData?.tournamentContext ?? proposalData?.tournamentContext;

        let title = '';
        if (tournamentContext?.roundId != null && tournamentContext?.tableIndex != null) {
          const roundNumber = roundNumberMap.get(String(tournamentContext.roundId));
          const roundLabel = roundNumber ? `Round ${roundNumber}` : 'Round ?';
          title = `${roundLabel} - Table ${Number(tournamentContext.tableIndex) + 1} • ${competitionLabel}`;
        } else {
          title = `${competitionLabel} - ${request.gameId}`;
        }
        title = `${title} • ${request.type === 'game_edit' ? 'Edit' : 'New game'}`;
        const subtitle = `${participantLabel || `Game ${request.gameId.slice(0, 8)}`} • #${request.gameId.slice(0, 8)}`;

        return {
          ...request,
          title,
          subtitle
        };
      });

      setRequests(mappedRequests);
    } catch (loadError) {
      const message = (loadError as { message?: string }).message ?? 'Failed to load inbox.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [profile?.activeClubId, user]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const onApprove = async (proposalId: string) => {
    setError(null);
    try {
      await approveProposal(proposalId);
      await load();
    } catch (approveError) {
      const message =
        (approveError as { code?: string; message?: string }).message ?? 'Failed to approve proposal.';
      setError(message);
    }
  };

  const onReject = async (proposalId: string) => {
    setError(null);
    try {
      await rejectProposal(proposalId);
      await load();
    } catch (rejectError) {
      const message =
        (rejectError as { code?: string; message?: string }).message ?? 'Failed to reject proposal.';
      setError(message);
    }
  };

  const onEnableNotifications = async () => {
    if (!user) {
      return;
    }

    setNotificationMessage(null);
    try {
      const token = await registerPushToken(user.uid);
      setNotificationMessage(
        token
          ? 'Browser notifications are enabled for this user.'
          : 'Notifications unavailable on this setup (missing config, denied permission, or unsupported browser). Inbox remains the fallback.'
      );
    } catch (tokenError) {
      const message = (tokenError as { message?: string }).message ?? 'Failed to enable notifications.';
      setNotificationMessage(message);
    }
  };

  return (
    <RequireAuth>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Inbox</h2>
        <p className="mt-1 text-sm text-slate-600">Validation requests for game creation and edit proposals.</p>
        <button className="mt-3 rounded border border-slate-300 px-3 py-2 text-sm" onClick={onEnableNotifications}>
          Enable browser notifications
        </button>
        {notificationMessage ? <p className="mt-2 text-sm text-slate-700">{notificationMessage}</p> : null}
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}

        {loading ? <p className="mt-3 text-sm text-slate-600">Loading...</p> : null}

        <ul className="mt-4 space-y-2">
          {requests.length === 0 ? <li className="text-sm text-slate-600">No requests.</li> : null}
          {requests.map((request) => (
            <li key={request.id} className="rounded border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{request.title}</p>
                  <p className="text-xs text-slate-600">{request.subtitle}</p>
                </div>
                <StatusBadge status={request.status} />
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <Link href={`/games/${request.gameId}`} className="underline">
                  Open game details
                </Link>
              </div>
              {request.status === 'pending' ? (
                <div className="mt-2 flex gap-2">
                  <button
                    className="rounded bg-emerald-700 px-3 py-1 text-sm text-white"
                    onClick={() => onApprove(request.proposalId)}
                  >
                    Approve
                  </button>
                  <button
                    className="rounded bg-rose-700 px-3 py-1 text-sm text-white"
                    onClick={() => onReject(request.proposalId)}
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </RequireAuth>
  );
}
