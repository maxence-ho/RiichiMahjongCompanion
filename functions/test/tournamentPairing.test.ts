import { describe, expect, it } from 'vitest';

import {
  buildEncounterCountsFromRounds,
  generatePrecomputedTournamentSchedule,
  generateTournamentPairings
} from '../src/core/tournamentPairing.js';

describe('generateTournamentPairings', () => {
  it('builds valid tables with 4 players each', () => {
    const pairings = generateTournamentPairings({
      playerIds: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'],
      standingsPoints: {
        u1: 50,
        u2: 40,
        u3: 30,
        u4: 20,
        u5: 10,
        u6: 0,
        u7: -10,
        u8: -20
      },
      encounterCounts: {}
    });

    expect(pairings).toHaveLength(2);
    for (const table of pairings) {
      expect(table.playerIds).toHaveLength(4);
    }

    const uniquePlayers = new Set(pairings.flatMap((table) => table.playerIds));
    expect(uniquePlayers.size).toBe(8);
  });

  it('builds encounter counts from previous rounds', () => {
    const rounds = [
      {
        tables: {
          '0': { playerIds: ['u1', 'u2', 'u3', 'u4'] },
          '1': { playerIds: ['u5', 'u6', 'u7', 'u8'] }
        }
      }
    ];

    const counts = buildEncounterCountsFromRounds(rounds);
    expect(counts['u1__u2']).toBe(1);
    expect(counts['u5__u8']).toBe(1);
    expect(counts['u1__u8']).toBeUndefined();
  });

  it('can precompute all rounds while minimizing repeat encounters', () => {
    const players = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'];
    const schedule = generatePrecomputedTournamentSchedule({
      playerIds: players,
      totalRounds: 2,
      attempts: 40
    });

    expect(schedule).toHaveLength(2);
    for (const round of schedule) {
      expect(round).toHaveLength(2);
      const seen = new Set(round.flatMap((table) => table.playerIds));
      expect(seen.size).toBe(players.length);
    }

    const roundsForCounts = schedule.map((tables) => ({
      tables: Object.fromEntries(tables.map((table) => [String(table.tableIndex), table]))
    }));
    const counts = buildEncounterCountsFromRounds(roundsForCounts);
    const repeatedExcess = Object.values(counts).reduce((sum, value) => sum + Math.max(0, value - 1), 0);
    expect(repeatedExcess).toBeLessThanOrEqual(4);
  });
});
