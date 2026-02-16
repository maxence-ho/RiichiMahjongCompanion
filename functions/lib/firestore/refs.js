"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.competitionLeaderboardEntryId = competitionLeaderboardEntryId;
exports.globalLeaderboardEntryId = globalLeaderboardEntryId;
exports.validationRequestId = validationRequestId;
function competitionLeaderboardEntryId(clubId, competitionId, userId) {
    return `${clubId}_${competitionId}_${userId}`;
}
function globalLeaderboardEntryId(clubId, userId) {
    return `${clubId}_${userId}`;
}
function validationRequestId(proposalId, userId) {
    return `${proposalId}_${userId}`;
}
