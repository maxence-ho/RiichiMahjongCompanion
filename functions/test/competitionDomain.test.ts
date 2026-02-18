import { describe, expect, it } from 'vitest';

import { isCompetitionValidationEnabled } from '../src/core/competition.js';

describe('competition domain', () => {
  it('defaults validation to enabled when missing', () => {
    expect(isCompetitionValidationEnabled(undefined)).toBe(true);
    expect(isCompetitionValidationEnabled(null)).toBe(true);
    expect(isCompetitionValidationEnabled({})).toBe(true);
  });

  it('returns false only when explicitly disabled', () => {
    expect(isCompetitionValidationEnabled({ validationEnabled: false })).toBe(false);
    expect(isCompetitionValidationEnabled({ validationEnabled: true })).toBe(true);
  });
});
