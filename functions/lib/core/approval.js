"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPendingProposalValidation = createPendingProposalValidation;
exports.resolveProposalValidation = resolveProposalValidation;
exports.applyValidationDecision = applyValidationDecision;
const https_1 = require("firebase-functions/v2/https");
function normalizeUserId(value) {
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
function toUniqueUserIds(values) {
    if (!Array.isArray(values)) {
        return [];
    }
    const unique = new Set();
    for (const value of values) {
        const normalized = normalizeUserId(value);
        if (normalized) {
            unique.add(normalized);
        }
    }
    return [...unique];
}
function toApprovalStatus(value) {
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'pending' || normalized === 'approved' || normalized === 'rejected') {
            return normalized;
        }
    }
    if (value && typeof value === 'object' && 'status' in value) {
        return toApprovalStatus(value.status);
    }
    return null;
}
function toUserApprovals(rawMap) {
    if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) {
        return {};
    }
    const parsed = {};
    for (const [rawUserId, rawStatus] of Object.entries(rawMap)) {
        const userId = normalizeUserId(rawUserId);
        const status = toApprovalStatus(rawStatus);
        if (!userId || !status) {
            continue;
        }
        parsed[userId] = status;
    }
    return parsed;
}
function toWriteModel(requiredUserIds, userApprovals) {
    const approvedBy = requiredUserIds.filter((userId) => userApprovals[userId] === 'approved');
    const rejectedBy = requiredUserIds.filter((userId) => userApprovals[userId] === 'rejected');
    return {
        requiredUserIds,
        userApprovals,
        approvedBy,
        rejectedBy
    };
}
function createPendingProposalValidation(requiredUserIds) {
    const uniqueRequiredUserIds = toUniqueUserIds(requiredUserIds);
    const userApprovals = {};
    for (const userId of uniqueRequiredUserIds) {
        userApprovals[userId] = 'pending';
    }
    return toWriteModel(uniqueRequiredUserIds, userApprovals);
}
function resolveProposalValidation(validation) {
    const validationRecord = (validation ?? {});
    const requiredUserIds = toUniqueUserIds(validationRecord.requiredUserIds);
    const approvedSet = new Set(toUniqueUserIds(validationRecord.approvedBy));
    const rejectedSet = new Set(toUniqueUserIds(validationRecord.rejectedBy));
    const mapApprovals = toUserApprovals(validationRecord.userApprovals);
    const normalizedApprovals = {};
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
function applyValidationDecision(validation, userId, decision) {
    const normalizedUserId = normalizeUserId(userId);
    if (!normalizedUserId) {
        throw new https_1.HttpsError('permission-denied', 'You are not allowed to validate this proposal.');
    }
    const current = resolveProposalValidation(validation);
    if (!current.requiredUserIds.includes(normalizedUserId)) {
        throw new https_1.HttpsError('permission-denied', 'You are not allowed to validate this proposal.');
    }
    const currentStatus = current.userApprovals[normalizedUserId] ?? 'pending';
    if (decision === 'approve') {
        if (currentStatus === 'rejected') {
            throw new https_1.HttpsError('failed-precondition', 'You already rejected this proposal.');
        }
    }
    else if (currentStatus === 'approved') {
        throw new https_1.HttpsError('failed-precondition', 'You already approved this proposal.');
    }
    const nextApprovals = {
        ...current.userApprovals,
        [normalizedUserId]: decision === 'approve' ? 'approved' : 'rejected'
    };
    return resolveProposalValidation({
        requiredUserIds: current.requiredUserIds,
        userApprovals: nextApprovals
    });
}
