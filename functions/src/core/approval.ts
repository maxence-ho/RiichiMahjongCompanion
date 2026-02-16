import { HttpsError } from 'firebase-functions/v2/https';

export type UserApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ValidationDecision = 'approve' | 'reject';

export interface ProposalValidationWriteModel {
  requiredUserIds: string[];
  userApprovals: Record<string, UserApprovalStatus>;
  approvedBy: string[];
  rejectedBy: string[];
}

export interface ProposalValidationView extends ProposalValidationWriteModel {
  pendingUserIds: string[];
  unanimityReached: boolean;
  hasRejection: boolean;
}

function normalizeUserId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!trimmed.includes('/')) {
    return trimmed;
  }

  const parts = trimmed.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

function toUniqueUserIds(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Set<string>();
  for (const value of values) {
    const normalized = normalizeUserId(value);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function toApprovalStatus(value: unknown): UserApprovalStatus | null {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'pending' || normalized === 'approved' || normalized === 'rejected') {
      return normalized;
    }
  }

  if (value && typeof value === 'object' && 'status' in value) {
    return toApprovalStatus((value as { status?: unknown }).status);
  }

  return null;
}

function toUserApprovals(rawMap: unknown): Record<string, UserApprovalStatus> {
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) {
    return {};
  }

  const parsed: Record<string, UserApprovalStatus> = {};
  for (const [rawUserId, rawStatus] of Object.entries(rawMap as Record<string, unknown>)) {
    const userId = normalizeUserId(rawUserId);
    const status = toApprovalStatus(rawStatus);
    if (!userId || !status) {
      continue;
    }

    parsed[userId] = status;
  }

  return parsed;
}

function toWriteModel(
  requiredUserIds: string[],
  userApprovals: Record<string, UserApprovalStatus>
): ProposalValidationWriteModel {
  const approvedBy = requiredUserIds.filter((userId) => userApprovals[userId] === 'approved');
  const rejectedBy = requiredUserIds.filter((userId) => userApprovals[userId] === 'rejected');

  return {
    requiredUserIds,
    userApprovals,
    approvedBy,
    rejectedBy
  };
}

export function createPendingProposalValidation(requiredUserIds: unknown): ProposalValidationWriteModel {
  const uniqueRequiredUserIds = toUniqueUserIds(requiredUserIds);
  const userApprovals: Record<string, UserApprovalStatus> = {};

  for (const userId of uniqueRequiredUserIds) {
    userApprovals[userId] = 'pending';
  }

  return toWriteModel(uniqueRequiredUserIds, userApprovals);
}

export function resolveProposalValidation(validation: unknown): ProposalValidationView {
  const validationRecord = (validation ?? {}) as Record<string, unknown>;
  const requiredUserIds = toUniqueUserIds(validationRecord.requiredUserIds);

  const approvedSet = new Set<string>(toUniqueUserIds(validationRecord.approvedBy));
  const rejectedSet = new Set<string>(toUniqueUserIds(validationRecord.rejectedBy));
  const mapApprovals = toUserApprovals(validationRecord.userApprovals);

  const normalizedApprovals: Record<string, UserApprovalStatus> = {};
  for (const userId of requiredUserIds) {
    const mappedStatus = mapApprovals[userId];
    if (mappedStatus) {
      normalizedApprovals[userId] = mappedStatus;
      continue;
    }

    if (rejectedSet.has(userId)) {
      normalizedApprovals[userId] = 'rejected';
      continue;
    }

    if (approvedSet.has(userId)) {
      normalizedApprovals[userId] = 'approved';
      continue;
    }

    normalizedApprovals[userId] = 'pending';
  }

  const writeModel = toWriteModel(requiredUserIds, normalizedApprovals);
  const pendingUserIds = requiredUserIds.filter((userId) => normalizedApprovals[userId] === 'pending');

  return {
    ...writeModel,
    pendingUserIds,
    unanimityReached: requiredUserIds.length > 0 && writeModel.rejectedBy.length === 0 && pendingUserIds.length === 0,
    hasRejection: writeModel.rejectedBy.length > 0
  };
}

export function applyValidationDecision(
  validation: unknown,
  userId: unknown,
  decision: ValidationDecision
): ProposalValidationView {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    throw new HttpsError('permission-denied', 'You are not allowed to validate this proposal.');
  }

  const current = resolveProposalValidation(validation);
  if (!current.requiredUserIds.includes(normalizedUserId)) {
    throw new HttpsError('permission-denied', 'You are not allowed to validate this proposal.');
  }

  const currentStatus = current.userApprovals[normalizedUserId] ?? 'pending';
  if (decision === 'approve') {
    if (currentStatus === 'rejected') {
      throw new HttpsError('failed-precondition', 'You already rejected this proposal.');
    }
  } else if (currentStatus === 'approved') {
    throw new HttpsError('failed-precondition', 'You already approved this proposal.');
  }

  const nextApprovals: Record<string, UserApprovalStatus> = {
    ...current.userApprovals,
    [normalizedUserId]: decision === 'approve' ? 'approved' : 'rejected'
  };

  return resolveProposalValidation({
    requiredUserIds: current.requiredUserIds,
    userApprovals: nextApprovals
  });
}
