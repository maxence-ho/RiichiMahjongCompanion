import { describe, expect, it } from 'vitest';

import {
  applyValidationDecision,
  createPendingProposalValidation,
  resolveProposalValidation
} from '../src/core/approval.js';

describe('approval domain', () => {
  it('creates a deterministic pending validation model', () => {
    const validation = createPendingProposalValidation(['u1', 'users/u2', 'u1', '', '  ', 'clubs/c/members/u3']);

    expect(validation.requiredUserIds).toEqual(['u1', 'u2', 'u3']);
    expect(validation.userApprovals).toEqual({
      u1: 'pending',
      u2: 'pending',
      u3: 'pending'
    });
    expect(validation.approvedBy).toEqual([]);
    expect(validation.rejectedBy).toEqual([]);
  });

  it('resolves legacy approval arrays into per-user statuses', () => {
    const resolved = resolveProposalValidation({
      requiredUserIds: ['u1', 'u2', 'u3', 'u4'],
      approvedBy: ['users/u1', 'u2', 'u3'],
      rejectedBy: []
    });

    expect(resolved.userApprovals).toEqual({
      u1: 'approved',
      u2: 'approved',
      u3: 'approved',
      u4: 'pending'
    });
    expect(resolved.pendingUserIds).toEqual(['u4']);
    expect(resolved.unanimityReached).toBe(false);
  });

  it('applies approvals until unanimity is reached', () => {
    let validation = resolveProposalValidation(createPendingProposalValidation(['u1', 'u2', 'u3', 'u4']));

    validation = applyValidationDecision(validation, 'u1', 'approve');
    expect(validation.unanimityReached).toBe(false);

    validation = applyValidationDecision(validation, 'u2', 'approve');
    expect(validation.unanimityReached).toBe(false);

    validation = applyValidationDecision(validation, 'u3', 'approve');
    expect(validation.unanimityReached).toBe(false);

    validation = applyValidationDecision(validation, 'u4', 'approve');
    expect(validation.unanimityReached).toBe(true);
    expect(validation.hasRejection).toBe(false);
    expect(validation.approvedBy).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('marks proposal rejected when one user rejects and blocks reversing decision', () => {
    let validation = resolveProposalValidation(createPendingProposalValidation(['u1', 'u2', 'u3', 'u4']));
    validation = applyValidationDecision(validation, 'u1', 'approve');
    validation = applyValidationDecision(validation, 'u2', 'reject');

    expect(validation.hasRejection).toBe(true);
    expect(validation.unanimityReached).toBe(false);
    expect(validation.userApprovals).toEqual({
      u1: 'approved',
      u2: 'rejected',
      u3: 'pending',
      u4: 'pending'
    });

    expect(() => applyValidationDecision(validation, 'u2', 'approve')).toThrowError(
      'You already rejected this proposal.'
    );
  });

  it('prevents non-required users from approving', () => {
    const validation = createPendingProposalValidation(['u1', 'u2', 'u3', 'u4']);

    expect(() => applyValidationDecision(validation, 'u5', 'approve')).toThrowError(
      'You are not allowed to validate this proposal.'
    );
  });

  it('keeps approval decision idempotent for repeated approval calls', () => {
    const base = resolveProposalValidation(createPendingProposalValidation(['u1', 'u2', 'u3', 'u4']));
    const once = applyValidationDecision(base, 'u1', 'approve');
    const twice = applyValidationDecision(once, 'u1', 'approve');

    expect(twice).toEqual(once);
  });

  it('prevents rejecting after approving', () => {
    let validation = resolveProposalValidation(createPendingProposalValidation(['u1', 'u2', 'u3', 'u4']));
    validation = applyValidationDecision(validation, 'u1', 'approve');

    expect(() => applyValidationDecision(validation, 'u1', 'reject')).toThrowError(
      'You already approved this proposal.'
    );
  });

  it('prefers explicit userApprovals over legacy arrays when data is mixed', () => {
    const resolved = resolveProposalValidation({
      requiredUserIds: ['u1', 'u2'],
      approvedBy: ['u1'],
      userApprovals: {
        u1: 'pending',
        u2: 'approved'
      }
    });

    expect(resolved.userApprovals).toEqual({
      u1: 'pending',
      u2: 'approved'
    });
    expect(resolved.approvedBy).toEqual(['u2']);
    expect(resolved.pendingUserIds).toEqual(['u1']);
  });
});
