import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import {
  createTournamentRoundSchema,
  parseOrThrow,
  requireAuthUid
} from '../core/validators.js';
import {
  type TableAssignment,
  type TournamentPairingAlgorithm,
  buildEncounterCountsFromRounds,
  generatePrecomputedTournamentSchedule,
  generateTournamentPairings
} from '../core/tournamentPairing.js';

function roundDocId(competitionId: string, roundNumber: number) {
  return `${competitionId}_round_${String(roundNumber).padStart(2, '0')}`;
}

function parsePairingAlgorithm(value: unknown): TournamentPairingAlgorithm {
  const candidate = String(value ?? 'performance_swiss');
  if (candidate === 'performance_swiss' || candidate === 'precomputed_min_repeats') {
    return candidate;
  }

  throw new HttpsError('failed-precondition', `Unsupported pairing algorithm: ${candidate}.`);
}

function createRoundTables(pairings: TableAssignment[]) {
  const tables: Record<
    string,
    {
      tableIndex: number;
      playerIds: string[];
      status: 'awaiting_result' | 'pending_validation' | 'validated' | 'disputed';
      proposalId: string | null;
      gameId: string | null;
    }
  > = {};

  for (const table of pairings) {
    tables[String(table.tableIndex)] = {
      tableIndex: table.tableIndex,
      playerIds: table.playerIds,
      status: 'awaiting_result',
      proposalId: null,
      gameId: null
    };
  }

  return tables;
}

function pairingsFromRoundTables(
  tables: Record<string, { tableIndex?: number; playerIds?: string[] }> | undefined
) {
  return Object.values(tables ?? {})
    .map((table, index) => ({
      tableIndex: Number(table.tableIndex ?? index),
      playerIds: [...(table.playerIds ?? [])]
    }))
    .sort((a, b) => a.tableIndex - b.tableIndex);
}

export async function createTournamentRoundPairingsHandler(data: unknown, uid?: string | null) {
  const input = parseOrThrow(createTournamentRoundSchema, data);
  const authUid = requireAuthUid(uid);
  const db = getFirestore();

  const memberRef = db.doc(`clubs/${input.clubId}/members/${authUid}`);
  const competitionRef = db.doc(`clubs/${input.clubId}/competitions/${input.competitionId}`);

  const [memberSnapshot, competitionSnapshot] = await Promise.all([memberRef.get(), competitionRef.get()]);

  if (!memberSnapshot.exists) {
    throw new HttpsError('permission-denied', 'You are not a club member.');
  }

  const role = memberSnapshot.data()?.role;
  if (role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admin can generate tournament rounds.');
  }

  if (!competitionSnapshot.exists) {
    throw new HttpsError('not-found', 'Competition not found.');
  }

  const competitionData = competitionSnapshot.data() as any;
  if (competitionData.type !== 'tournament') {
    throw new HttpsError('failed-precondition', 'Round generation is only available for tournaments.');
  }

  if (competitionData.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Tournament must be active.');
  }

  const participantUserIds = (competitionData.tournamentConfig?.participantUserIds ?? []) as string[];
  const totalRounds = Number(competitionData.tournamentConfig?.totalRounds ?? 0);
  const pairingAlgorithm = parsePairingAlgorithm(competitionData.tournamentConfig?.pairingAlgorithm);

  if (participantUserIds.length < 4 || participantUserIds.length % 4 !== 0) {
    throw new HttpsError('failed-precondition', 'Tournament participants must be a multiple of 4.');
  }

  if (new Set(participantUserIds).size !== participantUserIds.length) {
    throw new HttpsError('failed-precondition', 'Tournament participants must be unique.');
  }

  const participantMemberships = await Promise.all(
    participantUserIds.map((participantId) => db.doc(`clubs/${input.clubId}/members/${participantId}`).get())
  );
  if (participantMemberships.some((snapshot) => !snapshot.exists)) {
    throw new HttpsError('failed-precondition', 'All tournament participants must be club members.');
  }

  if (totalRounds <= 0) {
    throw new HttpsError('failed-precondition', 'Tournament total rounds must be greater than zero.');
  }

  const roundsSnapshot = await db
    .collection('tournamentRounds')
    .where('clubId', '==', input.clubId)
    .where('competitionId', '==', input.competitionId)
    .get();

  const existingRounds = roundsSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }));

  const activeRound = existingRounds.find((round) => round.status === 'active');
  if (activeRound) {
    throw new HttpsError('failed-precondition', `Round ${activeRound.roundNumber} is still active.`);
  }

  const lastRoundNumber = existingRounds.reduce((max, round) => Math.max(max, Number(round.roundNumber ?? 0)), 0);
  const nextRoundNumber = lastRoundNumber + 1;

  if (nextRoundNumber > totalRounds) {
    throw new HttpsError('failed-precondition', 'Tournament already reached configured total rounds.');
  }

  if (pairingAlgorithm === 'precomputed_min_repeats') {
    if (existingRounds.length === 0) {
      const schedule = generatePrecomputedTournamentSchedule({
        playerIds: participantUserIds,
        totalRounds
      });

      await db.runTransaction(async (transaction) => {
        const freshCompetition = await transaction.get(competitionRef);
        if (!freshCompetition.exists) {
          throw new HttpsError('not-found', 'Competition not found.');
        }

        const freshCompetitionData = freshCompetition.data() as any;
        if (freshCompetitionData.tournamentState?.activeRoundNumber != null) {
          throw new HttpsError('failed-precondition', 'There is already an active round.');
        }

        const roundRefs = schedule.map((_, index) =>
          db.doc(`tournamentRounds/${roundDocId(input.competitionId, index + 1)}`)
        );

        for (const roundRef of roundRefs) {
          const existingRoundSnapshot = await transaction.get(roundRef);
          if (existingRoundSnapshot.exists) {
            throw new HttpsError('already-exists', 'Round already exists.');
          }
        }

        for (let index = 0; index < schedule.length; index += 1) {
          const roundNumber = index + 1;
          transaction.set(roundRefs[index], {
            clubId: input.clubId,
            competitionId: input.competitionId,
            roundNumber,
            status: roundNumber === 1 ? 'active' : 'scheduled',
            tables: createRoundTables(schedule[index]),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });
        }

        transaction.update(competitionRef, {
          tournamentState: {
            activeRoundNumber: 1,
            lastCompletedRound: Number(freshCompetitionData.tournamentState?.lastCompletedRound ?? 0)
          },
          updatedAt: FieldValue.serverTimestamp()
        });
      });

      return {
        roundId: roundDocId(input.competitionId, 1),
        roundNumber: 1,
        tables: schedule[0]
      };
    }

    const nextScheduledRound = [...existingRounds]
      .filter((round) => round.status === 'scheduled')
      .sort((a, b) => Number(a.roundNumber ?? 0) - Number(b.roundNumber ?? 0))[0];

    if (!nextScheduledRound) {
      if (lastRoundNumber >= totalRounds) {
        throw new HttpsError('failed-precondition', 'Tournament already reached configured total rounds.');
      }

      throw new HttpsError('failed-precondition', 'No scheduled round available for activation.');
    }

    const roundId = String(nextScheduledRound.id);
    const roundRef = db.doc(`tournamentRounds/${roundId}`);
    const roundNumber = Number(nextScheduledRound.roundNumber ?? 0);

    await db.runTransaction(async (transaction) => {
      const [freshCompetition, freshRound] = await Promise.all([
        transaction.get(competitionRef),
        transaction.get(roundRef)
      ]);

      if (!freshCompetition.exists || !freshRound.exists) {
        throw new HttpsError('not-found', 'Competition or round not found.');
      }

      const freshCompetitionData = freshCompetition.data() as any;
      if (freshCompetitionData.tournamentState?.activeRoundNumber != null) {
        throw new HttpsError('failed-precondition', 'There is already an active round.');
      }

      if ((freshRound.data() as any).status !== 'scheduled') {
        throw new HttpsError('failed-precondition', 'Round is not in scheduled status.');
      }

      transaction.update(roundRef, {
        status: 'active',
        updatedAt: FieldValue.serverTimestamp()
      });

      transaction.update(competitionRef, {
        tournamentState: {
          activeRoundNumber: roundNumber,
          lastCompletedRound: Number(freshCompetitionData.tournamentState?.lastCompletedRound ?? 0)
        },
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    return {
      roundId,
      roundNumber,
      tables: pairingsFromRoundTables(nextScheduledRound.tables)
    };
  }

  const standingsSnapshot = await db
    .collection('competitionLeaderboardEntries')
    .where('clubId', '==', input.clubId)
    .where('competitionId', '==', input.competitionId)
    .get();

  const standingsPoints: Record<string, number> = {};
  for (const participant of participantUserIds) {
    standingsPoints[participant] = 0;
  }
  for (const entry of standingsSnapshot.docs) {
    const data = entry.data() as any;
    standingsPoints[data.userId] = Number(data.totalPoints ?? 0);
  }

  const encounterCounts = buildEncounterCountsFromRounds(existingRounds);
  const pairings = generateTournamentPairings({
    playerIds: participantUserIds,
    standingsPoints,
    encounterCounts
  });

  const tables = createRoundTables(pairings);

  const roundId = roundDocId(input.competitionId, nextRoundNumber);
  const roundRef = db.doc(`tournamentRounds/${roundId}`);

  await db.runTransaction(async (transaction) => {
    const [freshCompetition, freshRound] = await Promise.all([
      transaction.get(competitionRef),
      transaction.get(roundRef)
    ]);

    if (!freshCompetition.exists) {
      throw new HttpsError('not-found', 'Competition not found.');
    }

    if (freshRound.exists) {
      throw new HttpsError('already-exists', 'Round already exists.');
    }

    const freshCompetitionData = freshCompetition.data() as any;
    if (freshCompetitionData.tournamentState?.activeRoundNumber != null) {
      throw new HttpsError('failed-precondition', 'There is already an active round.');
    }

    transaction.set(roundRef, {
      clubId: input.clubId,
      competitionId: input.competitionId,
      roundNumber: nextRoundNumber,
      status: 'active',
      tables,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    transaction.update(competitionRef, {
      tournamentState: {
        activeRoundNumber: nextRoundNumber,
        lastCompletedRound: Number(freshCompetitionData.tournamentState?.lastCompletedRound ?? 0)
      },
      updatedAt: FieldValue.serverTimestamp()
    });
  });

  return {
    roundId,
    roundNumber: nextRoundNumber,
    tables: pairings
  };
}
