'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';

import { ProposalDiff } from '@/components/ProposalDiff';
import { RequireAuth } from '@/components/RequireAuth';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/Button';
import { useAuthContext } from '@/features/auth/AuthProvider';
import { submitGameEditProposal } from '@/lib/callables';
import { db } from '@/lib/firebaseClient';

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

interface GameData {
  id: string;
  clubId: string;
  status: 'pending_validation' | 'validated' | 'disputed' | 'cancelled';
  participants: string[];
  competitionIds: string[];
  activeVersionId?: string;
  pendingAction?: {
    type: 'create' | 'edit';
    proposalId: string;
  };
}

interface GameVersion {
  id: string;
  participants: string[];
  finalScores: Record<string, number>;
  competitionIds: string[];
}

interface Proposal {
  id: string;
  status: string;
  proposedVersion: {
    participants: string[];
    finalScores: Record<string, number>;
    competitionIds: string[];
  };
  validation?: {
    requiredUserIds: string[];
    approvedBy: string[];
    rejectedBy: string[];
    userApprovals?: Record<string, ApprovalStatus | string>;
  };
  createdAtMs: number;
}

function normalizeDocId(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!trimmed.includes('/')) {
    return trimmed;
  }

  const parts = trimmed.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

function normalizeUserId(value?: string | null): string | null {
  return normalizeDocId(value);
}

function normalizeApprovalStatus(value: unknown): ApprovalStatus | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'pending' || normalized === 'approved' || normalized === 'rejected') {
    return normalized;
  }

  return null;
}

export default function GameDetailPage() {
  const params = useParams<{ id: string }>();
  const { profile } = useAuthContext();
  const [game, setGame] = useState<GameData | null>(null);
  const [version, setVersion] = useState<GameVersion | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [currentProposal, setCurrentProposal] = useState<Proposal | null>(null);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [draftScores, setDraftScores] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const displayName = useCallback(
    (userId: string) => {
      return memberNames[userId] ?? userId;
    },
    [memberNames]
  );

  const load = useCallback(async () => {
    const gameId = params.id;
    if (!gameId || !profile?.activeClubId) {
      return;
    }

    setLoadError(null);
    try {
      const gameSnapshot = await getDoc(doc(db, `games/${gameId}`));
      if (!gameSnapshot.exists()) {
        setGame(null);
        setVersion(null);
        setProposals([]);
        setCurrentProposal(null);
        setMemberNames({});
        return;
      }

      const gameData = { id: gameSnapshot.id, ...(gameSnapshot.data() as Omit<GameData, 'id'>) } as GameData;
      setGame(gameData);

      if (gameData.activeVersionId) {
        const versionSnapshot = await getDoc(doc(db, `gameVersions/${gameData.activeVersionId}`));
        if (versionSnapshot.exists()) {
          const versionData = {
            id: versionSnapshot.id,
            ...(versionSnapshot.data() as Omit<GameVersion, 'id'>)
          } as GameVersion;
          setVersion(versionData);
          setDraftScores(versionData.finalScores);
        } else {
          setVersion(null);
        }
      } else {
        setVersion(null);
      }

      const proposalsSnapshot = await getDocs(
        query(
          collection(db, 'editProposals'),
          where('clubId', '==', gameData.clubId),
          where('gameId', '==', gameId)
        )
      );
      const proposalsMap = new Map<string, Proposal>();
      const mappedProposalsFromQuery = proposalsSnapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          status: docSnap.data().status,
          proposedVersion: docSnap.data().proposedVersion,
          validation: docSnap.data().validation,
          createdAtMs: docSnap.data().createdAt?.toMillis?.() ?? 0
        }))
        .sort((a, b) => b.createdAtMs - a.createdAtMs) as Proposal[];

      for (const proposal of mappedProposalsFromQuery) {
        proposalsMap.set(proposal.id, proposal);
      }

      let pendingProposalFromGame: Proposal | null = null;
      const pendingProposalId = normalizeDocId(gameData.pendingAction?.proposalId);
      if (pendingProposalId) {
        const pendingProposalSnapshot = await getDoc(doc(db, `editProposals/${pendingProposalId}`));
        if (pendingProposalSnapshot.exists()) {
          const pendingProposalData = {
            id: pendingProposalSnapshot.id,
            status: pendingProposalSnapshot.data().status,
            proposedVersion: pendingProposalSnapshot.data().proposedVersion,
            validation: pendingProposalSnapshot.data().validation,
            createdAtMs: pendingProposalSnapshot.data().createdAt?.toMillis?.() ?? 0
          } as Proposal;
          proposalsMap.set(pendingProposalData.id, pendingProposalData);
          pendingProposalFromGame = pendingProposalData;
        } else {
          pendingProposalFromGame = null;
        }
      }

      const mappedProposals = [...proposalsMap.values()].sort((a, b) => b.createdAtMs - a.createdAtMs);
      const resolvedCurrentProposal =
        pendingProposalFromGame ??
        mappedProposals.find((proposal) => proposal.status === 'pending_validation') ??
        null;

      setCurrentProposal(resolvedCurrentProposal);
      setProposals(mappedProposals);

      const memberIds = new Set<string>(
        (gameData.participants ?? []).map((participant) => normalizeUserId(participant) ?? participant)
      );
      for (const proposal of mappedProposals) {
        for (const userId of proposal.validation?.requiredUserIds ?? []) {
          const normalizedUserId = normalizeUserId(userId);
          if (normalizedUserId) {
            memberIds.add(normalizedUserId);
          }
        }
      }

      const memberIdList = [...memberIds];
      const memberSnapshots = await Promise.all(
        memberIdList.map((userId) => getDoc(doc(db, `clubs/${gameData.clubId}/members/${userId}`)))
      );

      const names: Record<string, string> = {};
      for (let index = 0; index < memberSnapshots.length; index += 1) {
        const snapshot = memberSnapshots[index];
        const userId = memberIdList[index];
        names[userId] = (snapshot.data()?.displayNameCache as string | undefined) ?? userId;
      }
      setMemberNames(names);
    } catch (error) {
      const message = (error as { message?: string }).message ?? 'Failed to load game details.';
      setLoadError(message);
    }
  }, [params.id, profile?.activeClubId]);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const pendingProposal = useMemo(() => {
    if (!game || game.status !== 'pending_validation') {
      return null;
    }

    const pendingProposalId = normalizeDocId(game.pendingAction?.proposalId);
    if (pendingProposalId) {
      const byId = proposals.find((proposal) => proposal.id === pendingProposalId) ?? null;
      if (byId) {
        return byId;
      }
    }

    return proposals.find((proposal) => proposal.status === 'pending_validation') ?? null;
  }, [game, proposals]);

  const approvalRows = useMemo(() => {
    if (!game) {
      return [];
    }

    const sourceProposal = currentProposal ?? pendingProposal;
    const requiredUserIds = new Set<string>();
    const userApprovalMap: Record<string, ApprovalStatus> = {};

    for (const userId of sourceProposal?.validation?.requiredUserIds ?? []) {
      const normalized = normalizeUserId(userId);
      if (normalized) {
        requiredUserIds.add(normalized);
      }
    }
    for (const userId of game.participants ?? []) {
      const normalized = normalizeUserId(userId);
      if (normalized) {
        requiredUserIds.add(normalized);
      }
    }

    for (const [rawUserId, rawStatus] of Object.entries(sourceProposal?.validation?.userApprovals ?? {})) {
      const normalizedUserId = normalizeUserId(rawUserId);
      const normalizedStatus = normalizeApprovalStatus(rawStatus);
      if (!normalizedUserId || !normalizedStatus) {
        continue;
      }

      requiredUserIds.add(normalizedUserId);
      userApprovalMap[normalizedUserId] = normalizedStatus;
    }

    const approvedSet = new Set<string>();
    for (const userId of sourceProposal?.validation?.approvedBy ?? []) {
      const normalized = normalizeUserId(userId);
      if (normalized) {
        approvedSet.add(normalized);
      }
    }

    const rejectedSet = new Set<string>();
    for (const userId of sourceProposal?.validation?.rejectedBy ?? []) {
      const normalized = normalizeUserId(userId);
      if (normalized) {
        rejectedSet.add(normalized);
      }
    }

    return [...requiredUserIds].map((userId) => {
      const mapStatus = userApprovalMap[userId];
      const isRejected = rejectedSet.has(userId);
      const isApproved = approvedSet.has(userId);

      const status: ApprovalStatus =
        mapStatus ??
        (isRejected
          ? 'rejected'
          : isApproved
            ? 'approved'
            : 'pending');

      return { userId, status };
    });
  }, [currentProposal, game, pendingProposal]);

  const submitEdit = async () => {
    if (!game || !version) {
      return;
    }

    try {
      const result = (await submitGameEditProposal({
        gameId: game.id,
        fromVersionId: version.id,
        proposedVersion: {
          participants: version.participants,
          finalScores: draftScores,
          competitionIds: game.competitionIds
        }
      })) as { status?: string };

      setMessage(
        result.status === 'validated'
          ? 'Edit recorded immediately.'
          : 'Edit proposal submitted. Waiting for unanimous approval.'
      );
      await load();
    } catch (editError) {
      const errorMessage =
        (editError as { code?: string; message?: string }).message ?? 'Failed to submit edit proposal.';
      setMessage(errorMessage);
    }
  };

  return (
    <RequireAuth>
      <section className="space-y-3">
        {!game ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">Game not found.</div>
        ) : (
          <>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Game {game.id}</h2>
                <StatusBadge status={game.status} />
              </div>
              <p className="mt-2 text-sm text-slate-700">
                Participants: {game.participants.map((participant) => displayName(participant)).join(', ')}
              </p>
              <p className="text-sm text-slate-700">
                Competition: {game.competitionIds.length ? game.competitionIds.join(', ') : 'None'}
              </p>
            </div>

            {game.status === 'pending_validation' ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-base font-semibold text-amber-900">Current approval status</h3>
                {pendingProposal ? (
                  <p className="mt-1 text-sm text-amber-800">
                    Proposal {pendingProposal.id.slice(0, 8)} is waiting for unanimous validation.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-amber-800">Waiting for unanimous validation.</p>
                )}
                <ul className="mt-3 space-y-1">
                  {approvalRows.map((row) => (
                    <li
                      key={row.userId}
                      className="flex items-center justify-between rounded border border-amber-100 bg-white px-3 py-2"
                    >
                      <span className="text-sm text-slate-800">{displayName(row.userId)}</span>
                      <StatusBadge status={row.status} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {version ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-base font-semibold">Active version</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {version.participants.map((participant) => (
                    <label key={participant} className="text-sm">
                      <span className="mb-1 block">{displayName(participant)}</span>
                      <input
                        className="w-full rounded border border-slate-300 p-2"
                        type="number"
                        value={draftScores[participant] ?? 0}
                        onChange={(event) =>
                          setDraftScores((current) => ({
                            ...current,
                            [participant]: Number(event.target.value)
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <Button className="mt-3" variant="primary" onClick={submitEdit}>
                  Submit edit proposal
                </Button>
              </div>
            ) : null}

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold">Proposals</h3>
              <div className="mt-3 space-y-2">
                {proposals.length === 0 ? <p className="text-sm text-slate-600">No proposals yet.</p> : null}
                {proposals.map((proposal) => (
                  <div key={proposal.id} className="space-y-2 rounded border border-slate-100 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Proposal {proposal.id.slice(0, 8)}</p>
                      <StatusBadge status={proposal.status as any} />
                    </div>
                    {version ? (
                      <ProposalDiff
                        before={{
                          participants: version.participants,
                          finalScores: version.finalScores,
                          competitionIds: version.competitionIds
                        }}
                        after={proposal.proposedVersion}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
            {loadError ? <p className="text-sm text-rose-700">{loadError}</p> : null}
          </>
        )}
      </section>
    </RequireAuth>
  );
}
