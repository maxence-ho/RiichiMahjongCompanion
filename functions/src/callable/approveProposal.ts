import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { applyProposal } from '../core/applyProposal.js';
import { applyValidationDecision, resolveProposalValidation } from '../core/approval.js';
import { normalizeDocId, parseOrThrow, proposalActionSchema, requireAuthUid } from '../core/validators.js';
import { validationRequestId } from '../firestore/refs.js';

export async function approveProposalHandler(data: unknown, uid?: string | null) {
  const input = parseOrThrow(proposalActionSchema, data);
  const proposalId = normalizeDocId(input.proposalId, 'editProposals');
  const authUid = requireAuthUid(uid);

  const db = getFirestore();

  const unanimityReached = await db.runTransaction(async (transaction) => {
    const proposalRef = db.doc(`editProposals/${proposalId}`);
    const proposalSnapshot = await transaction.get(proposalRef);
    if (!proposalSnapshot.exists) {
      throw new HttpsError('not-found', 'Proposal not found.');
    }

    const proposalData = proposalSnapshot.data() as any;
    if (proposalData.status !== 'pending_validation') {
      return false;
    }

    const nextValidation = applyValidationDecision(proposalData.validation, authUid, 'approve');

    transaction.update(proposalRef, {
      'validation.requiredUserIds': nextValidation.requiredUserIds,
      'validation.userApprovals': nextValidation.userApprovals,
      'validation.approvedBy': nextValidation.approvedBy,
      'validation.rejectedBy': nextValidation.rejectedBy,
      updatedAt: FieldValue.serverTimestamp()
    });

    const requestRef = db.doc(`validationRequests/${validationRequestId(proposalId, authUid)}`);
    transaction.set(
      requestRef,
      {
        status: 'approved',
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return nextValidation.unanimityReached;
  });

  let shouldApply = unanimityReached;

  if (!shouldApply) {
    const proposalSnapshot = await db.doc(`editProposals/${proposalId}`).get();
    if (proposalSnapshot.exists) {
      const proposalData = proposalSnapshot.data() as any;
      if (proposalData.status === 'pending_validation') {
        const validation = resolveProposalValidation(proposalData.validation);
        shouldApply = validation.unanimityReached;
      }
    }
  }

  if (shouldApply) {
    const applyResult = await applyProposal({
      db,
      proposalId
    });

    return {
      proposalStatus: applyResult.proposalStatus,
      gameStatus: applyResult.gameStatus
    };
  }

  return {
    proposalStatus: 'pending_validation',
    gameStatus: 'pending_validation'
  };
}
