"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveProposalHandler = approveProposalHandler;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const applyProposal_js_1 = require("../core/applyProposal.js");
const approval_js_1 = require("../core/approval.js");
const validators_js_1 = require("../core/validators.js");
const refs_js_1 = require("../firestore/refs.js");
async function approveProposalHandler(data, uid) {
    const input = (0, validators_js_1.parseOrThrow)(validators_js_1.proposalActionSchema, data);
    const proposalId = (0, validators_js_1.normalizeDocId)(input.proposalId, 'editProposals');
    const authUid = (0, validators_js_1.requireAuthUid)(uid);
    const db = (0, firestore_1.getFirestore)();
    const unanimityReached = await db.runTransaction(async (transaction) => {
        const proposalRef = db.doc(`editProposals/${proposalId}`);
        const proposalSnapshot = await transaction.get(proposalRef);
        if (!proposalSnapshot.exists) {
            throw new https_1.HttpsError('not-found', 'Proposal not found.');
        }
        const proposalData = proposalSnapshot.data();
        if (proposalData.status !== 'pending_validation') {
            return false;
        }
        const nextValidation = (0, approval_js_1.applyValidationDecision)(proposalData.validation, authUid, 'approve');
        transaction.update(proposalRef, {
            'validation.requiredUserIds': nextValidation.requiredUserIds,
            'validation.userApprovals': nextValidation.userApprovals,
            'validation.approvedBy': nextValidation.approvedBy,
            'validation.rejectedBy': nextValidation.rejectedBy,
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        });
        const requestRef = db.doc(`validationRequests/${(0, refs_js_1.validationRequestId)(proposalId, authUid)}`);
        transaction.set(requestRef, {
            status: 'approved',
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
        return nextValidation.unanimityReached;
    });
    let shouldApply = unanimityReached;
    if (!shouldApply) {
        const proposalSnapshot = await db.doc(`editProposals/${proposalId}`).get();
        if (proposalSnapshot.exists) {
            const proposalData = proposalSnapshot.data();
            if (proposalData.status === 'pending_validation') {
                const validation = (0, approval_js_1.resolveProposalValidation)(proposalData.validation);
                shouldApply = validation.unanimityReached;
            }
        }
    }
    if (shouldApply) {
        const applyResult = await (0, applyProposal_js_1.applyProposal)({
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
