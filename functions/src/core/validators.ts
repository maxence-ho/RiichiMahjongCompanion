import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';

import type { Rules } from '../types.js';

export const submitCreateSchema = z.object({
  clubId: z.string().min(1),
  participants: z.array(z.string().min(1)).length(4),
  finalScores: z.record(z.number()),
  competitionIds: z.array(z.string().min(1)).length(1),
  tournamentContext: z
    .object({
      roundId: z.string().min(1),
      tableIndex: z.coerce.number().int().min(0)
    })
    .optional()
});

export const submitEditSchema = z.object({
  gameId: z.string().min(1),
  fromVersionId: z.string().min(1),
  proposedVersion: z.object({
    participants: z.array(z.string().min(1)).length(4),
    finalScores: z.record(z.number()),
    competitionIds: z.array(z.string().min(1)).length(1)
  })
});

export const proposalActionSchema = z.object({
  proposalId: z.string().min(1)
});

export const rejectProposalSchema = z.object({
  proposalId: z.string().min(1),
  reason: z.string().max(500).optional()
});

export const createTournamentRoundSchema = z.object({
  clubId: z.string().min(1),
  competitionId: z.string().min(1)
});

export const submitTournamentTableResultSchema = z.object({
  clubId: z.string().min(1),
  competitionId: z.string().min(1),
  roundId: z.string().min(1),
  tableIndex: z.coerce.number().int().min(0),
  finalScores: z.record(z.number())
});

export const adminUpsertClubMemberSchema = z.object({
  clubId: z.string().min(1),
  targetUserId: z.string().min(1),
  role: z.enum(['admin', 'member'])
});

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const flattened = result.error.flatten();
    const fieldErrors = Object.entries(
      flattened.fieldErrors as Record<string, string[] | undefined>
    )
      .flatMap(([field, errors]) => (errors ?? []).map((message: string) => `${field}: ${message}`))
      .join('; ');
    const formErrors = flattened.formErrors.join('; ');
    const details = [fieldErrors, formErrors].filter(Boolean).join('; ');
    throw new HttpsError('invalid-argument', details || 'Invalid payload.');
  }

  return result.data;
}

export function normalizeDocId(value: string, collection: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpsError('invalid-argument', `${collection} id is required.`);
  }

  if (!trimmed.includes('/')) {
    return trimmed;
  }

  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length === 2 && parts[0] === collection) {
    return parts[1];
  }

  return parts[parts.length - 1];
}

export function requireAuthUid(uid?: string | null): string {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  return uid;
}

export function assertParticipantsUnique(participants: string[]) {
  if (new Set(participants).size !== participants.length) {
    throw new HttpsError('invalid-argument', 'Participants must be unique.');
  }
}

export function assertScoreMapMatchesParticipants(
  participants: string[],
  finalScores: Record<string, number>,
  scoreSum: number
) {
  const scoreKeys = Object.keys(finalScores);
  if (participants.length !== scoreKeys.length) {
    throw new HttpsError('invalid-argument', 'Scores must match participants exactly.');
  }

  for (const participant of participants) {
    if (!(participant in finalScores)) {
      throw new HttpsError('invalid-argument', `Missing score for participant ${participant}.`);
    }
  }

  const total = scoreKeys.reduce((sum, key) => sum + Number(finalScores[key]), 0);
  if (total !== scoreSum) {
    throw new HttpsError('invalid-argument', `Score sum must be ${scoreSum}.`);
  }
}

export function resolveRules(clubRules: Rules, competitionData?: any): Rules {
  if (!competitionData || !competitionData.rules || competitionData.rules.mode !== 'override') {
    return clubRules;
  }

  const overrideRules = competitionData.rules.overrideRules;
  return {
    ...clubRules,
    ...overrideRules
  };
}
