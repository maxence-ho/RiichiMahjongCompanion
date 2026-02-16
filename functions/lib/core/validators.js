"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminUpsertClubMemberSchema = exports.submitTournamentTableResultSchema = exports.createTournamentRoundSchema = exports.rejectProposalSchema = exports.proposalActionSchema = exports.submitEditSchema = exports.submitCreateSchema = void 0;
exports.parseOrThrow = parseOrThrow;
exports.normalizeDocId = normalizeDocId;
exports.requireAuthUid = requireAuthUid;
exports.assertParticipantsUnique = assertParticipantsUnique;
exports.assertScoreMapMatchesParticipants = assertScoreMapMatchesParticipants;
exports.resolveRules = resolveRules;
const https_1 = require("firebase-functions/v2/https");
const zod_1 = require("zod");
exports.submitCreateSchema = zod_1.z.object({
    clubId: zod_1.z.string().min(1),
    participants: zod_1.z.array(zod_1.z.string().min(1)).length(4),
    finalScores: zod_1.z.record(zod_1.z.number()),
    competitionIds: zod_1.z.array(zod_1.z.string().min(1)).length(1),
    tournamentContext: zod_1.z
        .object({
        roundId: zod_1.z.string().min(1),
        tableIndex: zod_1.z.coerce.number().int().min(0)
    })
        .optional()
});
exports.submitEditSchema = zod_1.z.object({
    gameId: zod_1.z.string().min(1),
    fromVersionId: zod_1.z.string().min(1),
    proposedVersion: zod_1.z.object({
        participants: zod_1.z.array(zod_1.z.string().min(1)).length(4),
        finalScores: zod_1.z.record(zod_1.z.number()),
        competitionIds: zod_1.z.array(zod_1.z.string().min(1)).length(1)
    })
});
exports.proposalActionSchema = zod_1.z.object({
    proposalId: zod_1.z.string().min(1)
});
exports.rejectProposalSchema = zod_1.z.object({
    proposalId: zod_1.z.string().min(1),
    reason: zod_1.z.string().max(500).optional()
});
exports.createTournamentRoundSchema = zod_1.z.object({
    clubId: zod_1.z.string().min(1),
    competitionId: zod_1.z.string().min(1)
});
exports.submitTournamentTableResultSchema = zod_1.z.object({
    clubId: zod_1.z.string().min(1),
    competitionId: zod_1.z.string().min(1),
    roundId: zod_1.z.string().min(1),
    tableIndex: zod_1.z.coerce.number().int().min(0),
    finalScores: zod_1.z.record(zod_1.z.number())
});
exports.adminUpsertClubMemberSchema = zod_1.z.object({
    clubId: zod_1.z.string().min(1),
    targetUserId: zod_1.z.string().min(1),
    role: zod_1.z.enum(['admin', 'member'])
});
function parseOrThrow(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        const flattened = result.error.flatten();
        const fieldErrors = Object.entries(flattened.fieldErrors)
            .flatMap(([field, errors]) => (errors ?? []).map((message) => `${field}: ${message}`))
            .join('; ');
        const formErrors = flattened.formErrors.join('; ');
        const details = [fieldErrors, formErrors].filter(Boolean).join('; ');
        throw new https_1.HttpsError('invalid-argument', details || 'Invalid payload.');
    }
    return result.data;
}
function normalizeDocId(value, collection) {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new https_1.HttpsError('invalid-argument', `${collection} id is required.`);
    }
    if (!trimmed.includes('/')) {
        return trimmed;
    }
    const parts = trimmed.split('/').filter(Boolean);
    if (parts.length === 2 && parts[0] === collection) {
        return parts[1];
    }
    return parts[parts.length - 1];
}
function requireAuthUid(uid) {
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication is required.');
    }
    return uid;
}
function assertParticipantsUnique(participants) {
    if (new Set(participants).size !== participants.length) {
        throw new https_1.HttpsError('invalid-argument', 'Participants must be unique.');
    }
}
function assertScoreMapMatchesParticipants(participants, finalScores, scoreSum) {
    const scoreKeys = Object.keys(finalScores);
    if (participants.length !== scoreKeys.length) {
        throw new https_1.HttpsError('invalid-argument', 'Scores must match participants exactly.');
    }
    for (const participant of participants) {
        if (!(participant in finalScores)) {
            throw new https_1.HttpsError('invalid-argument', `Missing score for participant ${participant}.`);
        }
    }
    const total = scoreKeys.reduce((sum, key) => sum + Number(finalScores[key]), 0);
    if (total !== scoreSum) {
        throw new https_1.HttpsError('invalid-argument', `Score sum must be ${scoreSum}.`);
    }
}
function resolveRules(clubRules, competitionData) {
    if (!competitionData || !competitionData.rules || competitionData.rules.mode !== 'override') {
        return clubRules;
    }
    const overrideRules = competitionData.rules.overrideRules;
    return {
        ...clubRules,
        ...overrideRules
    };
}
