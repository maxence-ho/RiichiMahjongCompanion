import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { applyValidationDecision } from '../core/approval.js';
import { normalizeDocId, parseOrThrow, rejectProposalSchema, requireAuthUid } from '../core/validators.js';
import { validationRequestId } from '../firestore/refs.js';

export async function rejectProposalHandler(data: unknown, uid?: string | null) {
  const input = parseOrThrow(rejectProposalSchema, data);
  const proposalId = normalizeDocId(input.proposalId, 'editProposals');
  const authUid = requireAuthUid(uid);

  const db = getFirestore();

  return db.runTransaction(async (transaction) => {
    const proposalRef = db.doc(`editProposals/${proposalId}`);
    const proposalSnapshot = await transaction.get(proposalRef);

    if (!proposalSnapshot.exists) {
      throw new HttpsError('not-found', 'Proposal not found.');
    }

    const proposalData = proposalSnapshot.data() as any;
    if (proposalData.status !== 'pending_validation') {
      return {
        proposalStatus: proposalData.status,
        gameStatus: 'disputed'
      };
    }

    const nextValidation = applyValidationDecision(proposalData.validation, authUid, 'reject');

    const gameId = normalizeDocId(String(proposalData.gameId ?? ''), 'games');
    const gameRef = db.doc(`games/${gameId}`);

    transaction.update(proposalRef, {
      status: 'rejected',
      'validation.requiredUserIds': nextValidation.requiredUserIds,
      'validation.userApprovals': nextValidation.userApprovals,
      'validation.approvedBy': nextValidation.approvedBy,
      'validation.rejectedBy': nextValidation.rejectedBy,
      rejectionReason: input.reason ?? null,
      updatedAt: FieldValue.serverTimestamp()
    });

    transaction.update(gameRef, {
      status: 'disputed',
      updatedAt: FieldValue.serverTimestamp()
    });

    const tournamentContext = proposalData.tournamentContext as
      | {
          roundId?: string;
          tableIndex?: number;
        }
      | null
      | undefined;
    if (tournamentContext?.roundId != null && tournamentContext.tableIndex != null) {
      const roundRef = db.doc(`tournamentRounds/${tournamentContext.roundId}`);
      const tableKey = String(tournamentContext.tableIndex);
      transaction.set(
        roundRef,
        {
          [`tables.${tableKey}.status`]: 'disputed',
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    transaction.set(
      db.doc(`validationRequests/${validationRequestId(proposalId, authUid)}`),
      {
        clubId: proposalData.clubId,
        userId: authUid,
        type: proposalData.type === 'edit' ? 'game_edit' : 'game_create',
        proposalId,
        gameId,
        status: 'rejected',
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return {
      proposalStatus: 'rejected',
      gameStatus: 'disputed'
    };
  });
}
