import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { computeLeaderboardDelta } from './leaderboardDelta.js';
import { resolveProposalValidation } from './approval.js';
import {
  competitionLeaderboardEntryId,
  globalLeaderboardEntryId,
  validationRequestId
} from '../firestore/refs.js';
import type { VersionRecord } from '../types.js';
import { normalizeDocId } from './validators.js';

interface ApplyProposalInput {
  db: Firestore;
  proposalId: string;
}

interface ApplyProposalResult {
  proposalStatus: string;
  gameStatus: string;
  versionId?: string;
}

interface TournamentUpdateContext {
  roundId: string;
  tableKey: string;
  roundNumber: number;
  allValidated: boolean;
  competitionId?: string;
}

export async function applyProposal({ db, proposalId }: ApplyProposalInput): Promise<ApplyProposalResult> {
  return db.runTransaction(async (transaction: Transaction) => {
    const proposalRef = db.doc(`editProposals/${proposalId}`);
    const proposalSnapshot = await transaction.get(proposalRef);

    if (!proposalSnapshot.exists) {
      throw new HttpsError('not-found', 'Proposal not found.');
    }

    const proposalData = proposalSnapshot.data() as any;

    const gameId = normalizeDocId(String(proposalData.gameId ?? ''), 'games');

    if (proposalData.status !== 'pending_validation') {
      const gameSnapshot = await transaction.get(db.doc(`games/${gameId}`));
      return {
        proposalStatus: proposalData.status,
        gameStatus: (gameSnapshot.data() as any)?.status ?? 'pending_validation'
      };
    }

    const validation = resolveProposalValidation(proposalData.validation);
    const required = validation.requiredUserIds;

    if (validation.hasRejection) {
      throw new HttpsError('failed-precondition', 'Proposal already rejected.');
    }

    if (!validation.unanimityReached) {
      throw new HttpsError('failed-precondition', 'Unanimity not reached yet.');
    }

    const gameRef = db.doc(`games/${gameId}`);
    const gameSnapshot = await transaction.get(gameRef);
    if (!gameSnapshot.exists) {
      throw new HttpsError('not-found', 'Game not found.');
    }

    let oldVersion: VersionRecord | null = null;
    if (proposalData.fromVersionId) {
      const previousVersionId = normalizeDocId(String(proposalData.fromVersionId), 'gameVersions');
      const oldVersionRef = db.doc(`gameVersions/${previousVersionId}`);
      const oldVersionSnapshot = await transaction.get(oldVersionRef);
      if (oldVersionSnapshot.exists) {
        oldVersion = oldVersionSnapshot.data() as VersionRecord;
      }
    }

    const tournamentContext = proposalData.tournamentContext as
      | {
          competitionId?: string;
          roundId?: string;
          tableIndex?: number;
        }
      | null
      | undefined;

    let tournamentUpdate: TournamentUpdateContext | null = null;
    let tournamentCompetitionRefPath: string | null = null;
    let tournamentCompetitionStatus: string | null = null;

    if (tournamentContext?.roundId != null && tournamentContext.tableIndex != null) {
      const roundRef = db.doc(`tournamentRounds/${tournamentContext.roundId}`);
      const roundSnapshot = await transaction.get(roundRef);
      if (roundSnapshot.exists) {
        const roundData = roundSnapshot.data() as any;
        const tableKey = String(tournamentContext.tableIndex);
        const table = roundData.tables?.[tableKey];
        if (table) {
          const updatedTables = {
            ...(roundData.tables ?? {}),
            [tableKey]: {
              ...table,
              status: 'validated',
              proposalId,
              gameId
            }
          };

          const allValidated = Object.values(updatedTables).every(
            (entry: any) => String(entry?.status) === 'validated'
          );

          tournamentUpdate = {
            roundId: tournamentContext.roundId,
            tableKey,
            roundNumber: Number(roundData.roundNumber ?? 0),
            allValidated,
            competitionId: tournamentContext.competitionId
          };

          if (allValidated && tournamentContext.competitionId) {
            const competitionRef = db.doc(
              `clubs/${proposalData.clubId}/competitions/${tournamentContext.competitionId}`
            );
            const competitionSnapshot = await transaction.get(competitionRef);
            if (competitionSnapshot.exists) {
              const competitionData = competitionSnapshot.data() as any;
              const totalRounds = Number(competitionData.tournamentConfig?.totalRounds ?? 0);
              const nextStatus =
                totalRounds > 0 && tournamentUpdate.roundNumber >= totalRounds
                  ? 'archived'
                  : competitionData.status;

              tournamentCompetitionRefPath = competitionRef.path;
              tournamentCompetitionStatus = nextStatus;
            }
          }
        }
      }
    }

    const newVersionRef = db.collection('gameVersions').doc();
    const versionNumber = oldVersion ? oldVersion.versionNumber + 1 : 1;
    const newVersion: VersionRecord = {
      gameId,
      clubId: proposalData.clubId,
      versionNumber,
      participants: proposalData.proposedVersion.participants,
      finalScores: proposalData.proposedVersion.finalScores,
      competitionIds: proposalData.proposedVersion.competitionIds,
      rulesSnapshot: proposalData.resolvedRulesSnapshot,
      computed: proposalData.computedPreview,
      createdBy: proposalData.createdBy,
      createdAt: FieldValue.serverTimestamp()
    };

    transaction.set(newVersionRef, newVersion);

    const deltas = computeLeaderboardDelta(oldVersion, newVersion);
    for (const delta of deltas) {
      if (delta.scope === 'competition' && delta.competitionId) {
        const entryRef = db.doc(
          `competitionLeaderboardEntries/${competitionLeaderboardEntryId(
            delta.clubId,
            delta.competitionId,
            delta.userId
          )}`
        );
        transaction.set(
          entryRef,
          {
            clubId: delta.clubId,
            competitionId: delta.competitionId,
            userId: delta.userId,
            totalPoints: FieldValue.increment(delta.totalPointsDelta),
            gamesPlayed: FieldValue.increment(delta.gamesPlayedDelta),
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      } else {
        const entryRef = db.doc(`globalLeaderboardEntries/${globalLeaderboardEntryId(delta.clubId, delta.userId)}`);
        transaction.set(
          entryRef,
          {
            clubId: delta.clubId,
            userId: delta.userId,
            totalPoints: FieldValue.increment(delta.totalPointsDelta),
            gamesPlayed: FieldValue.increment(delta.gamesPlayedDelta),
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }
    }

    transaction.update(gameRef, {
      status: 'validated',
      participants: newVersion.participants,
      competitionIds: newVersion.competitionIds,
      activeVersionId: newVersionRef.id,
      pendingAction: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp()
    });

    transaction.update(proposalRef, {
      status: 'accepted',
      'validation.requiredUserIds': validation.requiredUserIds,
      'validation.userApprovals': validation.userApprovals,
      'validation.approvedBy': validation.approvedBy,
      'validation.rejectedBy': validation.rejectedBy,
      updatedAt: FieldValue.serverTimestamp()
    });

    if (tournamentUpdate) {
      const roundRef = db.doc(`tournamentRounds/${tournamentUpdate.roundId}`);
      transaction.set(
        roundRef,
        {
          [`tables.${tournamentUpdate.tableKey}.status`]: 'validated',
          [`tables.${tournamentUpdate.tableKey}.proposalId`]: proposalId,
          [`tables.${tournamentUpdate.tableKey}.gameId`]: gameId,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      if (tournamentUpdate.allValidated) {
        transaction.set(
          roundRef,
          {
            status: 'completed',
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );

        if (tournamentCompetitionRefPath && tournamentCompetitionStatus != null) {
          transaction.update(db.doc(tournamentCompetitionRefPath), {
            tournamentState: {
              activeRoundNumber: null,
              lastCompletedRound: tournamentUpdate.roundNumber
            },
            status: tournamentCompetitionStatus,
            updatedAt: FieldValue.serverTimestamp()
          });
        }
      }
    }

    for (const userId of required) {
      transaction.set(
        db.doc(`validationRequests/${validationRequestId(proposalId, userId)}`),
        {
          clubId: proposalData.clubId,
          userId,
          type: proposalData.type === 'edit' ? 'game_edit' : 'game_create',
          proposalId,
          gameId,
          status: 'approved',
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    return {
      proposalStatus: 'accepted',
      gameStatus: 'validated',
      versionId: newVersionRef.id
    };
  });
}
