"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeLeaderboardDelta = computeLeaderboardDelta;
function versionScopes(competitionIds) {
    if (competitionIds.length === 0) {
        return [{ scope: 'global', competitionId: undefined }];
    }
    return competitionIds.map((competitionId) => ({
        scope: 'competition',
        competitionId
    }));
}
function addVersion(accumulator, version, sign) {
    const scopes = versionScopes(version.competitionIds);
    for (const participant of version.participants) {
        for (const scope of scopes) {
            const key = `${scope.scope}:${scope.competitionId ?? 'global'}:${participant}`;
            const existing = accumulator.get(key);
            const points = version.computed.totalPoints[participant] ?? 0;
            if (existing) {
                existing.totalPointsDelta += points * sign;
                existing.gamesPlayedDelta += sign;
                continue;
            }
            accumulator.set(key, {
                scope: scope.scope,
                clubId: version.clubId,
                competitionId: scope.competitionId,
                userId: participant,
                totalPointsDelta: points * sign,
                gamesPlayedDelta: sign
            });
        }
    }
}
function computeLeaderboardDelta(oldVersion, newVersion) {
    const delta = new Map();
    if (oldVersion) {
        addVersion(delta, oldVersion, -1);
    }
    addVersion(delta, newVersion, 1);
    return [...delta.values()].filter((change) => change.totalPointsDelta !== 0 || change.gamesPlayedDelta !== 0);
}
