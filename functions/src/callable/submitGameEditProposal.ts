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
  submitEditSchema
} from '../core/validators.js';
import { sendValidationNotifications } from '../core/notifications.js';
import { validationRequestId } from '../firestore/refs.js';
import type { Rules } from '../types.js';

export async function submitGameEditProposalHandler(data: unknown, uid?: string | null) {
  const input = parseOrThrow(submitEditSchema, data);
  const authUid = requireAuthUid(uid);

  assertParticipantsUnique(input.proposedVersion.participants);

  const db = getFirestore();
  const gameRef = db.doc(`games/${input.gameId}`);
  const gameSnapshot = await gameRef.get();

  if (!gameSnapshot.exists) {
    throw new HttpsError('not-found', 'Game not found.');
  }

  const gameData = gameSnapshot.data() as any;
  const clubId = gameData.clubId as string;

  const membershipSnapshot = await db.doc(`clubs/${clubId}/members/${authUid}`).get();
  if (!membershipSnapshot.exists) {
    throw new HttpsError('permission-denied', 'You are not a club member.');
  }

  if (gameData.status === 'cancelled') {
    throw new HttpsError('failed-precondition', 'Cancelled game cannot be edited.');
  }

  if (gameData.activeVersionId && gameData.activeVersionId !== input.fromVersionId) {
    throw new HttpsError('failed-precondition', 'fromVersionId must match current active version.');
  }

  const participantMemberships = await Promise.all(
    input.proposedVersion.participants.map((participant) => db.doc(`clubs/${clubId}/members/${participant}`).get())
  );
  if (participantMemberships.some((snapshot) => !snapshot.exists)) {
    throw new HttpsError('invalid-argument', 'All participants must be members of the club.');
  }

  const competitionId = input.proposedVersion.competitionIds[0];
  let competitionData: any | undefined;
  if (competitionId) {
    const competitionSnapshot = await db.doc(`clubs/${clubId}/competitions/${competitionId}`).get();
    if (!competitionSnapshot.exists) {
      throw new HttpsError('invalid-argument', 'Competition not found.');
    }

    competitionData = competitionSnapshot.data();
    if (competitionData?.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Competition must be active.');
    }
  }

  const clubSnapshot = await db.doc(`clubs/${clubId}`).get();
  const clubRules = (clubSnapshot.data()?.defaultRules as Rules | undefined) ?? {
    startingPoints: 25000,
    returnPoints: 30000,
    uma: [20, 10, -10, -20],
    oka: 0,
    scoreSum: 100000,
    rounding: 'nearest_100'
  };

  const resolvedRules = resolveRules(clubRules, competitionData);
  assertScoreMapMatchesParticipants(
    input.proposedVersion.participants,
    input.proposedVersion.finalScores,
    resolvedRules.scoreSum
  );

  const computedPreview = computeGameOutcome(
    input.proposedVersion.participants,
    input.proposedVersion.finalScores,
    resolvedRules
  );

  const proposalRef = db.collection('editProposals').doc();
  const requiredUserIds = Array.from(
    new Set([...(gameData.participants as string[]), ...input.proposedVersion.participants])
  );
  const validation = createPendingProposalValidation(requiredUserIds);

  const batch = db.batch();

  batch.set(proposalRef, {
    clubId,
    gameId: input.gameId,
    type: 'edit',
    status: 'pending_validation',
    fromVersionId: input.fromVersionId,
    proposedVersion: input.proposedVersion,
    resolvedRulesSnapshot: resolvedRules,
    computedPreview,
    validation: {
      ...validation,
      createdAt: FieldValue.serverTimestamp(),
      deadlineAt: null
    },
    createdBy: authUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  batch.update(gameRef, {
    status: 'pending_validation',
    pendingAction: {
      type: 'edit',
      proposalId: proposalRef.id
    },
    updatedAt: FieldValue.serverTimestamp()
  });

  for (const userId of requiredUserIds) {
    const requestRef = db.collection('validationRequests').doc(validationRequestId(proposalRef.id, userId));
    batch.set(requestRef, {
      clubId,
      userId,
      type: 'game_edit',
      proposalId: proposalRef.id,
      gameId: input.gameId,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  }

  await batch.commit();

  await sendValidationNotifications({
    db,
    messaging: getMessaging(),
    userIds: requiredUserIds,
    proposalId: proposalRef.id,
    gameId: input.gameId,
    type: 'game_edit'
  }).catch((error) => {
    console.warn('FCM notification failed for edit proposal', {
      proposalId: proposalRef.id,
      gameId: input.gameId,
      error: (error as Error).message
    });
  });

  return {
    gameId: input.gameId,
    proposalId: proposalRef.id,
    status: 'pending_validation'
  };
}
