"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitGameCreateProposalHandler = submitGameCreateProposalHandler;
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const https_1 = require("firebase-functions/v2/https");
const scoring_js_1 = require("../core/scoring.js");
const approval_js_1 = require("../core/approval.js");
const validators_js_1 = require("../core/validators.js");
const notifications_js_1 = require("../core/notifications.js");
const refs_js_1 = require("../firestore/refs.js");
async function submitGameCreateProposalHandler(data, uid) {
    const input = (0, validators_js_1.parseOrThrow)(validators_js_1.submitCreateSchema, data);
    const authUid = (0, validators_js_1.requireAuthUid)(uid);
    (0, validators_js_1.assertParticipantsUnique)(input.participants);
    const db = (0, firestore_1.getFirestore)();
    const clubRef = db.doc(`clubs/${input.clubId}`);
    const creatorMembershipRef = db.doc(`clubs/${input.clubId}/members/${authUid}`);
    const [clubSnapshot, creatorMembershipSnapshot] = await Promise.all([
        clubRef.get(),
        creatorMembershipRef.get()
    ]);
    if (!clubSnapshot.exists) {
        throw new https_1.HttpsError('not-found', 'Club not found.');
    }
    if (!creatorMembershipSnapshot.exists) {
        throw new https_1.HttpsError('permission-denied', 'You are not a club member.');
    }
    const memberSnapshots = await Promise.all(input.participants.map((participant) => db.doc(`clubs/${input.clubId}/members/${participant}`).get()));
    if (memberSnapshots.some((snapshot) => !snapshot.exists)) {
        throw new https_1.HttpsError('invalid-argument', 'All participants must be members of the club.');
    }
    const competitionId = input.competitionIds[0];
    let competitionData;
    if (competitionId) {
        const competitionSnapshot = await db.doc(`clubs/${input.clubId}/competitions/${competitionId}`).get();
        if (!competitionSnapshot.exists) {
            throw new https_1.HttpsError('invalid-argument', 'Competition not found.');
        }
        competitionData = competitionSnapshot.data();
        if (competitionData?.status !== 'active') {
            throw new https_1.HttpsError('failed-precondition', 'Competition must be active.');
        }
    }
    if (!competitionData) {
        throw new https_1.HttpsError('failed-precondition', 'A competition is required.');
    }
    const competitionType = competitionData.type;
    const isTournamentSubmission = Boolean(input.tournamentContext);
    if (competitionType === 'tournament' && !isTournamentSubmission) {
        throw new https_1.HttpsError('failed-precondition', 'Tournament games must be submitted from an active tournament table.');
    }
    if (competitionType === 'championship' && isTournamentSubmission) {
        throw new https_1.HttpsError('failed-precondition', 'Tournament context is not allowed for championship games.');
    }
    let tournamentRoundRefPath = null;
    if (input.tournamentContext) {
        const roundRef = db.doc(`tournamentRounds/${input.tournamentContext.roundId}`);
        const roundSnapshot = await roundRef.get();
        if (!roundSnapshot.exists) {
            throw new https_1.HttpsError('not-found', 'Tournament round not found.');
        }
        const roundData = roundSnapshot.data();
        if (roundData.clubId !== input.clubId ||
            roundData.competitionId !== competitionId ||
            roundData.status !== 'active') {
            throw new https_1.HttpsError('failed-precondition', 'Round is not active for this competition.');
        }
        const tableKey = String(input.tournamentContext.tableIndex);
        const table = roundData.tables?.[tableKey];
        if (!table) {
            throw new https_1.HttpsError('not-found', 'Tournament table not found.');
        }
        if (!['awaiting_result', 'disputed'].includes(String(table.status))) {
            throw new https_1.HttpsError('failed-precondition', `This table is not accepting result submission (status: ${String(table.status)}).`);
        }
        const expectedPlayers = new Set(table.playerIds ?? []);
        if (expectedPlayers.size !== input.participants.length) {
            throw new https_1.HttpsError('invalid-argument', 'Submitted participants do not match table players.');
        }
        for (const participant of input.participants) {
            if (!expectedPlayers.has(participant)) {
                throw new https_1.HttpsError('invalid-argument', 'Submitted participants do not match table players.');
            }
        }
        if (!expectedPlayers.has(authUid)) {
            const role = creatorMembershipSnapshot.data()?.role;
            if (role !== 'admin') {
                throw new https_1.HttpsError('permission-denied', 'Only table players or admin can submit round results.');
            }
        }
        tournamentRoundRefPath = roundRef.path;
    }
    const clubRules = clubSnapshot.data()?.defaultRules ?? {
        startingPoints: 25000,
        returnPoints: 30000,
        uma: [20, 10, -10, -20],
        oka: 0,
        scoreSum: 100000,
        rounding: 'nearest_100'
    };
    const resolvedRules = (0, validators_js_1.resolveRules)(clubRules, competitionData);
    (0, validators_js_1.assertScoreMapMatchesParticipants)(input.participants, input.finalScores, resolvedRules.scoreSum);
    const computedPreview = (0, scoring_js_1.computeGameOutcome)(input.participants, input.finalScores, resolvedRules);
    const validation = (0, approval_js_1.createPendingProposalValidation)(input.participants);
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
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp()
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
            createdAt: firestore_1.FieldValue.serverTimestamp(),
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
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    });
    for (const participant of input.participants) {
        const requestRef = db.collection('validationRequests').doc((0, refs_js_1.validationRequestId)(proposalRef.id, participant));
        batch.set(requestRef, {
            clubId: input.clubId,
            userId: participant,
            type: 'game_create',
            proposalId: proposalRef.id,
            gameId: gameRef.id,
            status: 'pending',
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        });
    }
    if (input.tournamentContext) {
        const tablePrefix = `tables.${String(input.tournamentContext.tableIndex)}`;
        batch.set(db.doc(`tournamentRounds/${input.tournamentContext.roundId}`), {
            [`${tablePrefix}.status`]: 'pending_validation',
            [`${tablePrefix}.proposalId`]: proposalRef.id,
            [`${tablePrefix}.gameId`]: gameRef.id,
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
    }
    await batch.commit();
    await (0, notifications_js_1.sendValidationNotifications)({
        db,
        messaging: (0, messaging_1.getMessaging)(),
        userIds: input.participants,
        proposalId: proposalRef.id,
        gameId: gameRef.id,
        type: 'game_create'
    }).catch((error) => {
        console.warn('FCM notification failed for create proposal', {
            proposalId: proposalRef.id,
            gameId: gameRef.id,
            error: error.message
        });
    });
    return {
        gameId: gameRef.id,
        proposalId: proposalRef.id,
        status: 'pending_validation'
    };
}
