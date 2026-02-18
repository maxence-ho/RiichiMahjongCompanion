import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { HttpsError } from 'firebase-functions/v2/https';

import { createApprovedProposalValidation, createPendingProposalValidation } from '../core/approval.js';
import { applyProposal } from '../core/applyProposal.js';
import { isCompetitionValidationEnabled } from '../core/competition.js';
import { computeGameOutcome } from '../core/scoring.js';
import { sendValidationNotifications } from '../core/notifications.js';
import { submitGameCreateProposalHandler } from './submitGameCreateProposal.js';
import {
  assertScoreMapMatchesParticipants,
  parseOrThrow,
  requireAuthUid,
  submitTournamentTableResultSchema
} from '../core/validators.js';
import { validationRequestId } from '../firestore/refs.js';

export async function submitTournamentTableResultProposalHandler(data: unknown, uid?: string | null) {
  const input = parseOrThrow(submitTournamentTableResultSchema, data);
  const authUid = requireAuthUid(uid);
  const db = getFirestore();

  const [memberSnapshot, competitionSnapshot, roundSnapshot] = await Promise.all([
    db.doc(`clubs/${input.clubId}/members/${authUid}`).get(),
    db.doc(`clubs/${input.clubId}/competitions/${input.competitionId}`).get(),
    db.doc(`tournamentRounds/${input.roundId}`).get()
  ]);

  if (!memberSnapshot.exists) {
    throw new HttpsError('permission-denied', 'You are not a club member.');
  }

  if (!competitionSnapshot.exists) {
    throw new HttpsError('not-found', 'Competition not found.');
  }

  const competitionData = competitionSnapshot.data() as any;
  if (competitionData.type !== 'tournament') {
    throw new HttpsError('failed-precondition', 'This callable is only available for tournaments.');
  }
  const validationEnabled = isCompetitionValidationEnabled(competitionData);

  if (!roundSnapshot.exists) {
    throw new HttpsError('not-found', 'Round not found.');
  }

  const roundData = roundSnapshot.data() as any;
  if (
    roundData.clubId !== input.clubId ||
    roundData.competitionId !== input.competitionId ||
    roundData.status !== 'active'
  ) {
    throw new HttpsError('failed-precondition', 'Round is not active for this tournament.');
  }

  const table = roundData.tables?.[String(input.tableIndex)] as
    | { playerIds?: string[]; status?: string }
    | undefined;

  if (!table) {
    throw new HttpsError('not-found', 'Table not found.');
  }

  if (!['awaiting_result', 'disputed', 'pending_validation'].includes(String(table.status))) {
    throw new HttpsError('failed-precondition', 'Result cannot be submitted for this table status.');
  }

  const playerIds = (table.playerIds ?? []) as string[];
  const isAdmin = memberSnapshot.data()?.role === 'admin';
  if (!playerIds.includes(authUid) && !isAdmin) {
    throw new HttpsError('permission-denied', 'Only table players or admin can submit this result.');
  }

  if (String(table.status) === 'pending_validation') {
    const proposalId = String((table as any).proposalId ?? '');
    const gameId = String((table as any).gameId ?? '');
    if (!proposalId || !gameId) {
      throw new HttpsError('failed-precondition', 'Missing pending proposal linkage for this table.');
    }

    const [proposalSnapshot, gameSnapshot] = await Promise.all([
      db.doc(`editProposals/${proposalId}`).get(),
      db.doc(`games/${gameId}`).get()
    ]);

    if (!proposalSnapshot.exists || !gameSnapshot.exists) {
      throw new HttpsError('not-found', 'Pending proposal or game not found for this table.');
    }

    const proposalData = proposalSnapshot.data() as any;
    const gameData = gameSnapshot.data() as any;

    if (proposalData.status !== 'pending_validation') {
      throw new HttpsError('failed-precondition', 'Pending proposal is no longer editable.');
    }

    if (gameData.status !== 'pending_validation') {
      throw new HttpsError('failed-precondition', 'Game is no longer in pending validation status.');
    }

    const rulesSnapshot = (proposalData.resolvedRulesSnapshot ?? {
      startingPoints: 25000,
      returnPoints: 30000,
      uma: [20, 10, -10, -20],
      oka: 0,
      scoreSum: 100000,
      rounding: 'nearest_100'
    }) as {
      scoreSum?: number;
      startingPoints?: number;
      returnPoints?: number;
      uma?: [number, number, number, number];
      oka?: number;
      rounding?: 'nearest_100' | 'none';
    };
    const resolvedRules = {
      startingPoints: Number(rulesSnapshot.startingPoints ?? 25000),
      returnPoints: Number(rulesSnapshot.returnPoints ?? 30000),
      uma: (rulesSnapshot.uma ?? [20, 10, -10, -20]) as [number, number, number, number],
      oka: Number(rulesSnapshot.oka ?? 0),
      scoreSum: Number(rulesSnapshot.scoreSum ?? 100000),
      rounding: (rulesSnapshot.rounding ?? 'nearest_100') as 'nearest_100' | 'none'
    };

    assertScoreMapMatchesParticipants(playerIds, input.finalScores, resolvedRules.scoreSum);

    const computedPreview = computeGameOutcome(playerIds, input.finalScores, resolvedRules);

    const requiredUserIds = Array.from(
      new Set([
        ...(proposalData.validation?.requiredUserIds ?? []),
        ...playerIds
      ])
    );
    const validation = validationEnabled
      ? createPendingProposalValidation(requiredUserIds)
      : createApprovedProposalValidation(requiredUserIds);

    const batch = db.batch();

    batch.set(
      proposalSnapshot.ref,
      {
        status: 'pending_validation',
        proposedVersion: {
          participants: playerIds,
          finalScores: input.finalScores,
          competitionIds: [input.competitionId]
        },
        computedPreview,
        validationRequired: validationEnabled,
        validation: {
          ...validation,
          createdAt: proposalData.validation?.createdAt ?? FieldValue.serverTimestamp(),
          deadlineAt: proposalData.validation?.deadlineAt ?? null
        },
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    batch.set(
      gameSnapshot.ref,
      {
        participants: playerIds,
        competitionIds: [input.competitionId],
        status: 'pending_validation',
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    if (validationEnabled) {
      for (const userId of requiredUserIds) {
        batch.set(
          db.doc(`validationRequests/${validationRequestId(proposalId, userId)}`),
          {
            clubId: input.clubId,
            userId,
            type: 'game_create',
            proposalId,
            gameId,
            status: 'pending',
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }
    }

    await batch.commit();

    if (!validationEnabled) {
      const applyResult = await applyProposal({
        db,
        proposalId,
      });

      return {
        gameId,
        proposalId,
        status: applyResult.gameStatus,
        resubmitted: true
      };
    }

    await sendValidationNotifications({
      db,
      messaging: getMessaging(),
      userIds: requiredUserIds,
      proposalId,
      gameId,
      type: 'game_create'
    }).catch((error) => {
      console.warn('FCM notification failed for tournament result resubmission', {
        proposalId,
        gameId,
        error: (error as Error).message
      });
    });

    return {
      gameId,
      proposalId,
      status: 'pending_validation',
      resubmitted: true
    };
  }

  return submitGameCreateProposalHandler(
    {
      clubId: input.clubId,
      participants: playerIds,
      finalScores: input.finalScores,
      competitionIds: [input.competitionId],
      tournamentContext: {
        roundId: input.roundId,
        tableIndex: input.tableIndex
      }
    },
    authUid
  );
}
