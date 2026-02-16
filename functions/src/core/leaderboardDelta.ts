import type { VersionRecord } from '../types.js';

export interface LeaderboardDelta {
  scope: 'competition' | 'global';
  clubId: string;
  competitionId?: string;
  userId: string;
  totalPointsDelta: number;
  gamesPlayedDelta: number;
}

function versionScopes(competitionIds: string[]) {
  if (competitionIds.length === 0) {
    return [{ scope: 'global' as const, competitionId: undefined }];
  }

  return competitionIds.map((competitionId) => ({
    scope: 'competition' as const,
    competitionId
  }));
}

function addVersion(
  accumulator: Map<string, LeaderboardDelta>,
  version: VersionRecord,
  sign: 1 | -1
) {
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

export function computeLeaderboardDelta(oldVersion: VersionRecord | null, newVersion: VersionRecord) {
  const delta = new Map<string, LeaderboardDelta>();

  if (oldVersion) {
    addVersion(delta, oldVersion, -1);
  }

  addVersion(delta, newVersion, 1);

  return [...delta.values()].filter(
    (change) => change.totalPointsDelta !== 0 || change.gamesPlayedDelta !== 0
  );
}
