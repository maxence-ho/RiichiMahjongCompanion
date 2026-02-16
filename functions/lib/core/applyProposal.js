"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyProposal = applyProposal;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const leaderboardDelta_js_1 = require("./leaderboardDelta.js");
const approval_js_1 = require("./approval.js");
const refs_js_1 = require("../firestore/refs.js");
const validators_js_1 = require("./validators.js");
async function applyProposal({ db, proposalId }) {
    return db.runTransaction(async (transaction) => {
        const proposalRef = db.doc(`editProposals/${proposalId}`);
        const proposalSnapshot = await transaction.get(proposalRef);
        if (!proposalSnapshot.exists) {
            throw new https_1.HttpsError('not-found', 'Proposal not found.');
        }
        const proposalData = proposalSnapshot.data();
        const gameId = (0, validators_js_1.normalizeDocId)(String(proposalData.gameId ?? ''), 'games');
        if (proposalData.status !== 'pending_validation') {
            const gameSnapshot = await transaction.get(db.doc(`games/${gameId}`));
            return {
                proposalStatus: proposalData.status,
                gameStatus: gameSnapshot.data()?.status ?? 'pending_validation'
            };
        }
        const validation = (0, approval_js_1.resolveProposalValidation)(proposalData.validation);
        const required = validation.requiredUserIds;
        if (validation.hasRejection) {
            throw new https_1.HttpsError('failed-precondition', 'Proposal already rejected.');
        }
        if (!validation.unanimityReached) {
            throw new https_1.HttpsError('failed-precondition', 'Unanimity not reached yet.');
        }
        const gameRef = db.doc(`games/${gameId}`);
        const gameSnapshot = await transaction.get(gameRef);
        if (!gameSnapshot.exists) {
            throw new https_1.HttpsError('not-found', 'Game not found.');
        }
        let oldVersion = null;
        if (proposalData.fromVersionId) {
            const previousVersionId = (0, validators_js_1.normalizeDocId)(String(proposalData.fromVersionId), 'gameVersions');
            const oldVersionRef = db.doc(`gameVersions/${previousVersionId}`);
            const oldVersionSnapshot = await transaction.get(oldVersionRef);
            if (oldVersionSnapshot.exists) {
                oldVersion = oldVersionSnapshot.data();
            }
        }
        const tournamentContext = proposalData.tournamentContext;
        let tournamentUpdate = null;
        let tournamentCompetitionRefPath = null;
        let tournamentCompetitionStatus = null;
        if (tournamentContext?.roundId != null && tournamentContext.tableIndex != null) {
            const roundRef = db.doc(`tournamentRounds/${tournamentContext.roundId}`);
            const roundSnapshot = await transaction.get(roundRef);
            if (roundSnapshot.exists) {
                const roundData = roundSnapshot.data();
                const tableKey = String(tournamentContext.tableIndex);
                const table = roundData.tables?.[tableKey];
                if (table) {
                    const updatedTables = {
                        ...(roundData.tables ?? {}),
                        [tableKey]: {
                            ...table,
                            status: 'validated',
                            proposalId,
                            gameId
                        }
                    };
                    const allValidated = Object.values(updatedTables).every((entry) => String(entry?.status) === 'validated');
                    tournamentUpdate = {
                        roundId: tournamentContext.roundId,
                        tableKey,
                        roundNumber: Number(roundData.roundNumber ?? 0),
                        allValidated,
                        competitionId: tournamentContext.competitionId
                    };
                    if (allValidated && tournamentContext.competitionId) {
                        const competitionRef = db.doc(`clubs/${proposalData.clubId}/competitions/${tournamentContext.competitionId}`);
                        const competitionSnapshot = await transaction.get(competitionRef);
                        if (competitionSnapshot.exists) {
                            const competitionData = competitionSnapshot.data();
                            const totalRounds = Number(competitionData.tournamentConfig?.totalRounds ?? 0);
                            const nextStatus = totalRounds > 0 && tournamentUpdate.roundNumber >= totalRounds
                                ? 'archived'
                                : competitionData.status;
                            tournamentCompetitionRefPath = competitionRef.path;
                            tournamentCompetitionStatus = nextStatus;
                        }
                    }
                }
            }
        }
        const newVersionRef = db.collection('gameVersions').doc();
        const versionNumber = oldVersion ? oldVersion.versionNumber + 1 : 1;
        const newVersion = {
            gameId,
            clubId: proposalData.clubId,
            versionNumber,
            participants: proposalData.proposedVersion.participants,
            finalScores: proposalData.proposedVersion.finalScores,
            competitionIds: proposalData.proposedVersion.competitionIds,
            rulesSnapshot: proposalData.resolvedRulesSnapshot,
            computed: proposalData.computedPreview,
            createdBy: proposalData.createdBy,
            createdAt: firestore_1.FieldValue.serverTimestamp()
        };
        transaction.set(newVersionRef, newVersion);
        const deltas = (0, leaderboardDelta_js_1.computeLeaderboardDelta)(oldVersion, newVersion);
        for (const delta of deltas) {
            if (delta.scope === 'competition' && delta.competitionId) {
                const entryRef = db.doc(`competitionLeaderboardEntries/${(0, refs_js_1.competitionLeaderboardEntryId)(delta.clubId, delta.competitionId, delta.userId)}`);
                transaction.set(entryRef, {
                    clubId: delta.clubId,
                    competitionId: delta.competitionId,
                    userId: delta.userId,
                    totalPoints: firestore_1.FieldValue.increment(delta.totalPointsDelta),
                    gamesPlayed: firestore_1.FieldValue.increment(delta.gamesPlayedDelta),
                    updatedAt: firestore_1.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            else {
                const entryRef = db.doc(`globalLeaderboardEntries/${(0, refs_js_1.globalLeaderboardEntryId)(delta.clubId, delta.userId)}`);
                transaction.set(entryRef, {
                    clubId: delta.clubId,
                    userId: delta.userId,
                    totalPoints: firestore_1.FieldValue.increment(delta.totalPointsDelta),
                    gamesPlayed: firestore_1.FieldValue.increment(delta.gamesPlayedDelta),
                    updatedAt: firestore_1.FieldValue.serverTimestamp()
                }, { merge: true });
            }
        }
        transaction.update(gameRef, {
            status: 'validated',
            participants: newVersion.participants,
            competitionIds: newVersion.competitionIds,
            activeVersionId: newVersionRef.id,
            pendingAction: firestore_1.FieldValue.delete(),
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        });
        transaction.update(proposalRef, {
            status: 'accepted',
            'validation.requiredUserIds': validation.requiredUserIds,
            'validation.userApprovals': validation.userApprovals,
            'validation.approvedBy': validation.approvedBy,
            'validation.rejectedBy': validation.rejectedBy,
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        });
        if (tournamentUpdate) {
            const roundRef = db.doc(`tournamentRounds/${tournamentUpdate.roundId}`);
            transaction.set(roundRef, {
                [`tables.${tournamentUpdate.tableKey}.status`]: 'validated',
                [`tables.${tournamentUpdate.tableKey}.proposalId`]: proposalId,
                [`tables.${tournamentUpdate.tableKey}.gameId`]: gameId,
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            }, { merge: true });
            if (tournamentUpdate.allValidated) {
                transaction.set(roundRef, {
                    status: 'completed',
                    updatedAt: firestore_1.FieldValue.serverTimestamp()
                }, { merge: true });
                if (tournamentCompetitionRefPath && tournamentCompetitionStatus != null) {
                    transaction.update(db.doc(tournamentCompetitionRefPath), {
                        tournamentState: {
                            activeRoundNumber: null,
                            lastCompletedRound: tournamentUpdate.roundNumber
                        },
                        status: tournamentCompetitionStatus,
                        updatedAt: firestore_1.FieldValue.serverTimestamp()
                    });
                }
            }
        }
        for (const userId of required) {
            transaction.set(db.doc(`validationRequests/${(0, refs_js_1.validationRequestId)(proposalId, userId)}`), {
                clubId: proposalData.clubId,
                userId,
                type: proposalData.type === 'edit' ? 'game_edit' : 'game_create',
                proposalId,
                gameId,
                status: 'approved',
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        return {
            proposalStatus: 'accepted',
            gameStatus: 'validated',
            versionId: newVersionRef.id
        };
    });
}
