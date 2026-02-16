import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { HttpsError } from 'firebase-functions/v2/https';

import { computeGameOutcome } from '../core/scoring.js';
import { createPendingProposalValidation } from '../core/approval.js';
import {
  assertParticipantsUnique,
  assertScoreMapMatchesParticipants,
  parseOrThrow,
  requireAuthUid,
  resolveRules,
  submitCreateSchema
} from '../core/validators.js';
import { sendValidationNotifications } from '../core/notifications.js';
import { validationRequestId } from '../firestore/refs.js';
import type { Rules } from '../types.js';

export async function submitGameCreateProposalHandler(data: unknown, uid?: string | null) {
  const input = parseOrThrow(submitCreateSchema, data);
  const authUid = requireAuthUid(uid);

  assertParticipantsUnique(input.participants);

  const db = getFirestore();
  const clubRef = db.doc(`clubs/${input.clubId}`);
  const creatorMembershipRef = db.doc(`clubs/${input.clubId}/members/${authUid}`);

  const [clubSnapshot, creatorMembershipSnapshot] = await Promise.all([
    clubRef.get(),
    creatorMembershipRef.get()
  ]);

  if (!clubSnapshot.exists) {
    throw new HttpsError('not-found', 'Club not found.');
  }

  if (!creatorMembershipSnapshot.exists) {
    throw new HttpsError('permission-denied', 'You are not a club member.');
  }

  const memberSnapshots = await Promise.all(
    input.participants.map((participant) => db.doc(`clubs/${input.clubId}/members/${participant}`).get())
  );
  if (memberSnapshots.some((snapshot) => !snapshot.exists)) {
    throw new HttpsError('invalid-argument', 'All participants must be members of the club.');
  }

  const competitionId = input.competitionIds[0];
  let competitionData: any | undefined;
  if (competitionId) {
    const competitionSnapshot = await db.doc(`clubs/${input.clubId}/competitions/${competitionId}`).get();
    if (!competitionSnapshot.exists) {
      throw new HttpsError('invalid-argument', 'Competition not found.');
    }

    competitionData = competitionSnapshot.data();
    if (competitionData?.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Competition must be active.');
    }
  }

  if (!competitionData) {
    throw new HttpsError('failed-precondition', 'A competition is required.');
  }

  const competitionType = competitionData.type as 'championship' | 'tournament';
  const isTournamentSubmission = Boolean(input.tournamentContext);

  if (competitionType === 'tournament' && !isTournamentSubmission) {
    throw new HttpsError(
      'failed-precondition',
      'Tournament games must be submitted from an active tournament table.'
    );
  }

  if (competitionType === 'championship' && isTournamentSubmission) {
    throw new HttpsError(
      'failed-precondition',
      'Tournament context is not allowed for championship games.'
    );
  }

  let tournamentRoundRefPath: string | null = null;
  if (input.tournamentContext) {
    const roundRef = db.doc(`tournamentRounds/${input.tournamentContext.roundId}`);
    const roundSnapshot = await roundRef.get();
    if (!roundSnapshot.exists) {
      throw new HttpsError('not-found', 'Tournament round not found.');
    }

    const roundData = roundSnapshot.data() as any;
    if (
      roundData.clubId !== input.clubId ||
      roundData.competitionId !== competitionId ||
      roundData.status !== 'active'
    ) {
      throw new HttpsError('failed-precondition', 'Round is not active for this competition.');
    }

    const tableKey = String(input.tournamentContext.tableIndex);
    const table = roundData.tables?.[tableKey];
    if (!table) {
      throw new HttpsError('not-found', 'Tournament table not found.');
    }

    if (!['awaiting_result', 'disputed'].includes(String(table.status))) {
      throw new HttpsError(
        'failed-precondition',
        `This table is not accepting result submission (status: ${String(table.status)}).`
      );
    }

    const expectedPlayers = new Set<string>(table.playerIds ?? []);
    if (expectedPlayers.size !== input.participants.length) {
      throw new HttpsError('invalid-argument', 'Submitted participants do not match table players.');
    }

    for (const participant of input.participants) {
      if (!expectedPlayers.has(participant)) {
        throw new HttpsError('invalid-argument', 'Submitted participants do not match table players.');
      }
    }

    if (!expectedPlayers.has(authUid)) {
      const role = creatorMembershipSnapshot.data()?.role;
      if (role !== 'admin') {
        throw new HttpsError('permission-denied', 'Only table players or admin can submit round results.');
      }
    }

    tournamentRoundRefPath = roundRef.path;
  }

  const clubRules = (clubSnapshot.data()?.defaultRules as Rules | undefined) ?? {
    startingPoints: 25000,
    returnPoints: 30000,
    uma: [20, 10, -10, -20],
    oka: 0,
    scoreSum: 100000,
    rounding: 'nearest_100'
  };

  const resolvedRules = resolveRules(clubRules, competitionData);
  assertScoreMapMatchesParticipants(input.participants, input.finalScores, resolvedRules.scoreSum);

  const computedPreview = computeGameOutcome(input.participants, input.finalScores, resolvedRules);
  const validation = createPendingProposalValidation(input.participants);

  const gameRef = db.collection('games').doc();
  const proposalRef = db.collection('editProposals').doc();

  const batch = db.batch();
  batch.set(gameRef, {
    clubId: input.clubId,
    createdBy: authUid,
    status: 'pending_validation',
    participants: input.participants,
    competitionIds: input.competitionIds,
    activeVersionId: null,
    pendingAction: {
      type: 'create',
      proposalId: proposalRef.id
    },
    tournamentContext: input.tournamentContext
      ? {
          competitionId,
          roundId: input.tournamentContext.roundId,
          tableIndex: input.tournamentContext.tableIndex
        }
      : null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  batch.set(proposalRef, {
    clubId: input.clubId,
    gameId: gameRef.id,
    type: 'create',
    status: 'pending_validation',
    fromVersionId: null,
    proposedVersion: {
      participants: input.participants,
      finalScores: input.finalScores,
      competitionIds: input.competitionIds
    },
    resolvedRulesSnapshot: resolvedRules,
    computedPreview,
    validation: {
      ...validation,
      createdAt: FieldValue.serverTimestamp(),
      deadlineAt: null
    },
    tournamentContext: input.tournamentContext
      ? {
          competitionId,
          roundId: input.tournamentContext.roundId,
          tableIndex: input.tournamentContext.tableIndex,
          roundRefPath: tournamentRoundRefPath
        }
      : null,
    createdBy: authUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  for (const participant of input.participants) {
    const requestRef = db.collection('validationRequests').doc(validationRequestId(proposalRef.id, participant));
    batch.set(requestRef, {
      clubId: input.clubId,
      userId: participant,
      type: 'game_create',
      proposalId: proposalRef.id,
      gameId: gameRef.id,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  }

  if (input.tournamentContext) {
    const tablePrefix = `tables.${String(input.tournamentContext.tableIndex)}`;
    batch.set(
      db.doc(`tournamentRounds/${input.tournamentContext.roundId}`),
      {
        [`${tablePrefix}.status`]: 'pending_validation',
        [`${tablePrefix}.proposalId`]: proposalRef.id,
        [`${tablePrefix}.gameId`]: gameRef.id,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  await batch.commit();

  await sendValidationNotifications({
    db,
    messaging: getMessaging(),
    userIds: input.participants,
    proposalId: proposalRef.id,
    gameId: gameRef.id,
    type: 'game_create'
  }).catch((error) => {
    console.warn('FCM notification failed for create proposal', {
      proposalId: proposalRef.id,
      gameId: gameRef.id,
      error: (error as Error).message
    });
  });

  return {
    gameId: gameRef.id,
    proposalId: proposalRef.id,
    status: 'pending_validation'
  };
}
