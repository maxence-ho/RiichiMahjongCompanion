import { describe, expect, it } from 'vitest';

import { computeGameOutcome } from '../src/core/scoring.js';

describe('computeGameOutcome', () => {
  it('computes total points with default UMA', () => {
    const rules = {
      startingPoints: 25000,
      returnPoints: 30000,
      uma: [20, 10, -10, -20] as [number, number, number, number],
      oka: 0,
      scoreSum: 100000,
      rounding: 'nearest_100' as const
    };

    const result = computeGameOutcome(
      ['u1', 'u2', 'u3', 'u4'],
      {
        u1: 42300,
        u2: 31200,
        u3: 17800,
        u4: 8700
      },
      rules
    );

    expect(result.ranks.u1).toBe(1);
    expect(result.ranks.u4).toBe(4);
    expect(result.totalPoints.u1).toBeCloseTo(32.3, 1);
    expect(result.totalPoints.u4).toBeCloseTo(-41.3, 1);
  });

  it('splits UMA and OKA on tie', () => {
    const rules = {
      startingPoints: 25000,
      returnPoints: 30000,
      uma: [20, 10, -10, -20] as [number, number, number, number],
      oka: 20,
      scoreSum: 100000,
      rounding: 'none' as const
    };

    const result = computeGameOutcome(
      ['u1', 'u2', 'u3', 'u4'],
      {
        u1: 30000,
        u2: 30000,
        u3: 20000,
        u4: 20000
      },
      rules
    );

    expect(result.totalPoints.u1).toBe(result.totalPoints.u2);
    expect(result.totalPoints.u1).toBe(25);
    expect(result.totalPoints.u3).toBe(result.totalPoints.u4);
  });
});
