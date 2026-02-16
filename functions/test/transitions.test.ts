import { describe, expect, it } from 'vitest';

import { canTransitionGameStatus } from '../src/core/transitions.js';

describe('canTransitionGameStatus', () => {
  it('allows pending to validated/disputed', () => {
    expect(canTransitionGameStatus('pending_validation', 'validated')).toBe(true);
    expect(canTransitionGameStatus('pending_validation', 'disputed')).toBe(true);
  });

  it('allows validated to pending_validation for edit cycle', () => {
    expect(canTransitionGameStatus('validated', 'pending_validation')).toBe(true);
  });

  it('blocks cancelled outgoing transitions', () => {
    expect(canTransitionGameStatus('cancelled', 'validated')).toBe(false);
    expect(canTransitionGameStatus('cancelled', 'pending_validation')).toBe(false);
  });
});
