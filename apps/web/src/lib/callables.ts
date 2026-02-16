import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebaseClient';

export interface SubmitGameCreateProposalInput {
  clubId: string;
  participants: string[];
  finalScores: Record<string, number>;
  competitionIds: string[];
  tournamentContext?: {
    roundId: string;
    tableIndex: number;
  };
}

export interface SubmitGameEditProposalInput {
  gameId: string;
  fromVersionId: string;
  proposedVersion: {
    participants: string[];
    finalScores: Record<string, number>;
    competitionIds: string[];
  };
}

export async function submitGameCreateProposal(input: SubmitGameCreateProposalInput) {
  const callable = httpsCallable(functions, 'submitGameCreateProposal');
  const response = await callable(input);
  return response.data;
}

export async function submitGameEditProposal(input: SubmitGameEditProposalInput) {
  const callable = httpsCallable(functions, 'submitGameEditProposal');
  const response = await callable(input);
  return response.data;
}

export async function approveProposal(proposalId: string) {
  const normalizedProposalId = proposalId?.trim();
  if (!normalizedProposalId) {
    throw new Error('Missing proposalId.');
  }

  const callable = httpsCallable(functions, 'approveProposal');
  const response = await callable({ proposalId: normalizedProposalId });
  return response.data;
}

export async function rejectProposal(proposalId: string, reason?: string) {
  const normalizedProposalId = proposalId?.trim();
  if (!normalizedProposalId) {
    throw new Error('Missing proposalId.');
  }

  const callable = httpsCallable(functions, 'rejectProposal');
  const response = await callable({ proposalId: normalizedProposalId, reason });
  return response.data;
}

export async function createTournamentRoundPairings(input: {
  clubId: string;
  competitionId: string;
}) {
  const callable = httpsCallable(functions, 'createTournamentRoundPairings');
  const response = await callable(input);
  return response.data as {
    roundId: string;
    roundNumber: number;
    tables: Array<{ tableIndex: number; playerIds: string[] }>;
  };
}

export async function submitTournamentTableResultProposal(input: {
  clubId: string;
  competitionId: string;
  roundId: string;
  tableIndex: number;
  finalScores: Record<string, number>;
}) {
  const callable = httpsCallable(functions, 'submitTournamentTableResultProposal');
  const response = await callable(input);
  return response.data;
}

export async function adminUpsertClubMember(input: {
  clubId: string;
  targetUserId: string;
  role: 'admin' | 'member';
}) {
  const callable = httpsCallable(functions, 'adminUpsertClubMember');
  const response = await callable(input);
  return response.data;
}
