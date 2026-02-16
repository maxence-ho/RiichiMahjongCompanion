"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitTournamentTableResultProposalHandler = submitTournamentTableResultProposalHandler;
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const https_1 = require("firebase-functions/v2/https");
const approval_js_1 = require("../core/approval.js");
const scoring_js_1 = require("../core/scoring.js");
const notifications_js_1 = require("../core/notifications.js");
const submitGameCreateProposal_js_1 = require("./submitGameCreateProposal.js");
const validators_js_1 = require("../core/validators.js");
const refs_js_1 = require("../firestore/refs.js");
async function submitTournamentTableResultProposalHandler(data, uid) {
    const input = (0, validators_js_1.parseOrThrow)(validators_js_1.submitTournamentTableResultSchema, data);
    const authUid = (0, validators_js_1.requireAuthUid)(uid);
    const db = (0, firestore_1.getFirestore)();
    const [memberSnapshot, competitionSnapshot, roundSnapshot] = await Promise.all([
        db.doc(`clubs/${input.clubId}/members/${authUid}`).get(),
        db.doc(`clubs/${input.clubId}/competitions/${input.competitionId}`).get(),
        db.doc(`tournamentRounds/${input.roundId}`).get()
    ]);
    if (!memberSnapshot.exists) {
        throw new https_1.HttpsError('permission-denied', 'You are not a club member.');
    }
    if (!competitionSnapshot.exists) {
        throw new https_1.HttpsError('not-found', 'Competition not found.');
    }
    const competitionData = competitionSnapshot.data();
    if (competitionData.type !== 'tournament') {
        throw new https_1.HttpsError('failed-precondition', 'This callable is only available for tournaments.');
    }
    if (!roundSnapshot.exists) {
        throw new https_1.HttpsError('not-found', 'Round not found.');
    }
    const roundData = roundSnapshot.data();
    if (roundData.clubId !== input.clubId ||
        roundData.competitionId !== input.competitionId ||
        roundData.status !== 'active') {
        throw new https_1.HttpsError('failed-precondition', 'Round is not active for this tournament.');
    }
    const table = roundData.tables?.[String(input.tableIndex)];
    if (!table) {
        throw new https_1.HttpsError('not-found', 'Table not found.');
    }
    if (!['awaiting_result', 'disputed', 'pending_validation'].includes(String(table.status))) {
        throw new https_1.HttpsError('failed-precondition', 'Result cannot be submitted for this table status.');
    }
    const playerIds = (table.playerIds ?? []);
    const isAdmin = memberSnapshot.data()?.role === 'admin';
    if (!playerIds.includes(authUid) && !isAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Only table players or admin can submit this result.');
    }
    if (String(table.status) === 'pending_validation') {
        const proposalId = String(table.proposalId ?? '');
        const gameId = String(table.gameId ?? '');
        if (!proposalId || !gameId) {
            throw new https_1.HttpsError('failed-precondition', 'Missing pending proposal linkage for this table.');
        }
        const [proposalSnapshot, gameSnapshot] = await Promise.all([
            db.doc(`editProposals/${proposalId}`).get(),
            db.doc(`games/${gameId}`).get()
        ]);
        if (!proposalSnapshot.exists || !gameSnapshot.exists) {
            throw new https_1.HttpsError('not-found', 'Pending proposal or game not found for this table.');
        }
        const proposalData = proposalSnapshot.data();
        const gameData = gameSnapshot.data();
        if (proposalData.status !== 'pending_validation') {
            throw new https_1.HttpsError('failed-precondition', 'Pending proposal is no longer editable.');
        }
        if (gameData.status !== 'pending_validation') {
            throw new https_1.HttpsError('failed-precondition', 'Game is no longer in pending validation status.');
        }
        const rulesSnapshot = (proposalData.resolvedRulesSnapshot ?? {
            startingPoints: 25000,
            returnPoints: 30000,
            uma: [20, 10, -10, -20],
            oka: 0,
            scoreSum: 100000,
            rounding: 'nearest_100'
        });
        const resolvedRules = {
            startingPoints: Number(rulesSnapshot.startingPoints ?? 25000),
            returnPoints: Number(rulesSnapshot.returnPoints ?? 30000),
            uma: (rulesSnapshot.uma ?? [20, 10, -10, -20]),
            oka: Number(rulesSnapshot.oka ?? 0),
            scoreSum: Number(rulesSnapshot.scoreSum ?? 100000),
            rounding: (rulesSnapshot.rounding ?? 'nearest_100')
        };
        (0, validators_js_1.assertScoreMapMatchesParticipants)(playerIds, input.finalScores, resolvedRules.scoreSum);
        const computedPreview = (0, scoring_js_1.computeGameOutcome)(playerIds, input.finalScores, resolvedRules);
        const requiredUserIds = Array.from(new Set([
            ...(proposalData.validation?.requiredUserIds ?? []),
            ...playerIds
        ]));
        const validation = (0, approval_js_1.createPendingProposalValidation)(requiredUserIds);
        const batch = db.batch();
        batch.set(proposalSnapshot.ref, {
            status: 'pending_validation',
            proposedVersion: {
                participants: playerIds,
                finalScores: input.finalScores,
                competitionIds: [input.competitionId]
            },
            computedPreview,
            validation: {
                ...validation,
                createdAt: proposalData.validation?.createdAt ?? firestore_1.FieldValue.serverTimestamp(),
                deadlineAt: proposalData.validation?.deadlineAt ?? null
            },
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
        batch.set(gameSnapshot.ref, {
            participants: playerIds,
            competitionIds: [input.competitionId],
            status: 'pending_validation',
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
        for (const userId of requiredUserIds) {
            batch.set(db.doc(`validationRequests/${(0, refs_js_1.validationRequestId)(proposalId, userId)}`), {
                clubId: input.clubId,
                userId,
                type: 'game_create',
                proposalId,
                gameId,
                status: 'pending',
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        await batch.commit();
        await (0, notifications_js_1.sendValidationNotifications)({
            db,
            messaging: (0, messaging_1.getMessaging)(),
            userIds: requiredUserIds,
            proposalId,
            gameId,
            type: 'game_create'
        }).catch((error) => {
            console.warn('FCM notification failed for tournament result resubmission', {
                proposalId,
                gameId,
                error: error.message
            });
        });
        return {
            gameId,
            proposalId,
            status: 'pending_validation',
            resubmitted: true
        };
    }
    return (0, submitGameCreateProposal_js_1.submitGameCreateProposalHandler)({
        clubId: input.clubId,
        participants: playerIds,
        finalScores: input.finalScores,
        competitionIds: [input.competitionId],
        tournamentContext: {
            roundId: input.roundId,
            tableIndex: input.tableIndex
        }
    }, authUid);
}
