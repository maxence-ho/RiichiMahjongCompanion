import { describe, expect, it } from 'vitest';

import { computeLeaderboardDelta } from '../src/core/leaderboardDelta.js';
import type { VersionRecord } from '../src/types.js';

const makeVersion = (overrides: Partial<VersionRecord>): VersionRecord => ({
  gameId: 'games/g1',
  clubId: 'c1',
  versionNumber: 1,
  participants: ['u1', 'u2', 'u3', 'u4'],
  finalScores: { u1: 40000, u2: 30000, u3: 20000, u4: 10000 },
  competitionIds: ['cmp1'],
  rulesSnapshot: {
    startingPoints: 25000,
    returnPoints: 30000,
    uma: [20, 10, -10, -20] as [number, number, number, number],
    oka: 0,
    scoreSum: 100000,
    rounding: 'nearest_100'
  },
  computed: {
    ranks: { u1: 1, u2: 2, u3: 3, u4: 4 },
    totalPoints: { u1: 30, u2: 10, u3: -10, u4: -30 }
  },
  createdBy: 'u1',
  createdAt: new Date(),
  ...overrides
});

describe('computeLeaderboardDelta', () => {
  it('creates positive deltas for a newly validated game', () => {
    const next = makeVersion({});
    const delta = computeLeaderboardDelta(null, next);

    expect(delta).toHaveLength(4);
    expect(delta.find((item) => item.userId === 'u1')?.totalPointsDelta).toBe(30);
    expect(delta.find((item) => item.userId === 'u1')?.gamesPlayedDelta).toBe(1);
  });

  it('moves points when competition changes', () => {
    const oldVersion = makeVersion({ competitionIds: ['cmp1'] });
    const newVersion = makeVersion({ competitionIds: ['cmp2'], versionNumber: 2 });

    const delta = computeLeaderboardDelta(oldVersion, newVersion);
    const cmp1U1 = delta.find((item) => item.competitionId === 'cmp1' && item.userId === 'u1');
    const cmp2U1 = delta.find((item) => item.competitionId === 'cmp2' && item.userId === 'u1');

    expect(cmp1U1?.totalPointsDelta).toBe(-30);
    expect(cmp1U1?.gamesPlayedDelta).toBe(-1);
    expect(cmp2U1?.totalPointsDelta).toBe(30);
    expect(cmp2U1?.gamesPlayedDelta).toBe(1);
  });
});
