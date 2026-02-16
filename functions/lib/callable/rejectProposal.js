"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectProposalHandler = rejectProposalHandler;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const approval_js_1 = require("../core/approval.js");
const validators_js_1 = require("../core/validators.js");
const refs_js_1 = require("../firestore/refs.js");
async function rejectProposalHandler(data, uid) {
    const input = (0, validators_js_1.parseOrThrow)(validators_js_1.rejectProposalSchema, data);
    const proposalId = (0, validators_js_1.normalizeDocId)(input.proposalId, 'editProposals');
    const authUid = (0, validators_js_1.requireAuthUid)(uid);
    const db = (0, firestore_1.getFirestore)();
    return db.runTransaction(async (transaction) => {
        const proposalRef = db.doc(`editProposals/${proposalId}`);
        const proposalSnapshot = await transaction.get(proposalRef);
        if (!proposalSnapshot.exists) {
            throw new https_1.HttpsError('not-found', 'Proposal not found.');
        }
        const proposalData = proposalSnapshot.data();
        if (proposalData.status !== 'pending_validation') {
            return {
                proposalStatus: proposalData.status,
                gameStatus: 'disputed'
            };
        }
        const nextValidation = (0, approval_js_1.applyValidationDecision)(proposalData.validation, authUid, 'reject');
        const gameId = (0, validators_js_1.normalizeDocId)(String(proposalData.gameId ?? ''), 'games');
        const gameRef = db.doc(`games/${gameId}`);
        transaction.update(proposalRef, {
            status: 'rejected',
            'validation.requiredUserIds': nextValidation.requiredUserIds,
            'validation.userApprovals': nextValidation.userApprovals,
            'validation.approvedBy': nextValidation.approvedBy,
            'validation.rejectedBy': nextValidation.rejectedBy,
            rejectionReason: input.reason ?? null,
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        });
        transaction.update(gameRef, {
            status: 'disputed',
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        });
        const tournamentContext = proposalData.tournamentContext;
        if (tournamentContext?.roundId != null && tournamentContext.tableIndex != null) {
            const roundRef = db.doc(`tournamentRounds/${tournamentContext.roundId}`);
            const tableKey = String(tournamentContext.tableIndex);
            transaction.set(roundRef, {
                [`tables.${tableKey}.status`]: 'disputed',
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        transaction.set(db.doc(`validationRequests/${(0, refs_js_1.validationRequestId)(proposalId, authUid)}`), {
            clubId: proposalData.clubId,
            userId: authUid,
            type: proposalData.type === 'edit' ? 'game_edit' : 'game_create',
            proposalId,
            gameId,
            status: 'rejected',
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
        return {
            proposalStatus: 'rejected',
            gameStatus: 'disputed'
        };
    });
}
