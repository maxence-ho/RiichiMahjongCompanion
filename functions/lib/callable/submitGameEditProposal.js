"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitGameEditProposalHandler = submitGameEditProposalHandler;
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const https_1 = require("firebase-functions/v2/https");
const scoring_js_1 = require("../core/scoring.js");
const approval_js_1 = require("../core/approval.js");
const validators_js_1 = require("../core/validators.js");
const notifications_js_1 = require("../core/notifications.js");
const refs_js_1 = require("../firestore/refs.js");
async function submitGameEditProposalHandler(data, uid) {
    const input = (0, validators_js_1.parseOrThrow)(validators_js_1.submitEditSchema, data);
    const authUid = (0, validators_js_1.requireAuthUid)(uid);
    (0, validators_js_1.assertParticipantsUnique)(input.proposedVersion.participants);
    const db = (0, firestore_1.getFirestore)();
    const gameRef = db.doc(`games/${input.gameId}`);
    const gameSnapshot = await gameRef.get();
    if (!gameSnapshot.exists) {
        throw new https_1.HttpsError('not-found', 'Game not found.');
    }
    const gameData = gameSnapshot.data();
    const clubId = gameData.clubId;
    const membershipSnapshot = await db.doc(`clubs/${clubId}/members/${authUid}`).get();
    if (!membershipSnapshot.exists) {
        throw new https_1.HttpsError('permission-denied', 'You are not a club member.');
    }
    if (gameData.status === 'cancelled') {
        throw new https_1.HttpsError('failed-precondition', 'Cancelled game cannot be edited.');
    }
    if (gameData.activeVersionId && gameData.activeVersionId !== input.fromVersionId) {
        throw new https_1.HttpsError('failed-precondition', 'fromVersionId must match current active version.');
    }
    const participantMemberships = await Promise.all(input.proposedVersion.participants.map((participant) => db.doc(`clubs/${clubId}/members/${participant}`).get()));
    if (participantMemberships.some((snapshot) => !snapshot.exists)) {
        throw new https_1.HttpsError('invalid-argument', 'All participants must be members of the club.');
    }
    const competitionId = input.proposedVersion.competitionIds[0];
    let competitionData;
    if (competitionId) {
        const competitionSnapshot = await db.doc(`clubs/${clubId}/competitions/${competitionId}`).get();
        if (!competitionSnapshot.exists) {
            throw new https_1.HttpsError('invalid-argument', 'Competition not found.');
        }
        competitionData = competitionSnapshot.data();
        if (competitionData?.status !== 'active') {
            throw new https_1.HttpsError('failed-precondition', 'Competition must be active.');
        }
    }
    const clubSnapshot = await db.doc(`clubs/${clubId}`).get();
    const clubRules = clubSnapshot.data()?.defaultRules ?? {
        startingPoints: 25000,
        returnPoints: 30000,
        uma: [20, 10, -10, -20],
        oka: 0,
        scoreSum: 100000,
        rounding: 'nearest_100'
    };
    const resolvedRules = (0, validators_js_1.resolveRules)(clubRules, competitionData);
    (0, validators_js_1.assertScoreMapMatchesParticipants)(input.proposedVersion.participants, input.proposedVersion.finalScores, resolvedRules.scoreSum);
    const computedPreview = (0, scoring_js_1.computeGameOutcome)(input.proposedVersion.participants, input.proposedVersion.finalScores, resolvedRules);
    const proposalRef = db.collection('editProposals').doc();
    const requiredUserIds = Array.from(new Set([...gameData.participants, ...input.proposedVersion.participants]));
    const validation = (0, approval_js_1.createPendingProposalValidation)(requiredUserIds);
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
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            deadlineAt: null
        },
        createdBy: authUid,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    });
    batch.update(gameRef, {
        status: 'pending_validation',
        pendingAction: {
            type: 'edit',
            proposalId: proposalRef.id
        },
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    });
    for (const userId of requiredUserIds) {
        const requestRef = db.collection('validationRequests').doc((0, refs_js_1.validationRequestId)(proposalRef.id, userId));
        batch.set(requestRef, {
            clubId,
            userId,
            type: 'game_edit',
            proposalId: proposalRef.id,
            gameId: input.gameId,
            status: 'pending',
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        });
    }
    await batch.commit();
    await (0, notifications_js_1.sendValidationNotifications)({
        db,
        messaging: (0, messaging_1.getMessaging)(),
        userIds: requiredUserIds,
        proposalId: proposalRef.id,
        gameId: input.gameId,
        type: 'game_edit'
    }).catch((error) => {
        console.warn('FCM notification failed for edit proposal', {
            proposalId: proposalRef.id,
            gameId: input.gameId,
            error: error.message
        });
    });
    return {
        gameId: input.gameId,
        proposalId: proposalRef.id,
        status: 'pending_validation'
    };
}
