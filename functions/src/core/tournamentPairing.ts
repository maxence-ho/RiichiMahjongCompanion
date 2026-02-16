interface PairingInput {
  playerIds: string[];
  standingsPoints: Record<string, number>;
  encounterCounts: Record<string, number>;
}

export interface TableAssignment {
  tableIndex: number;
  playerIds: string[];
}

export type TournamentPairingAlgorithm = 'performance_swiss' | 'precomputed_min_repeats';

function pairKey(a: string, b: string) {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function createSeededRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function stringHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }

  return out;
}

function addTableEncounters(encounterCounts: Record<string, number>, players: string[]) {
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const key = pairKey(players[i], players[j]);
      encounterCounts[key] = (encounterCounts[key] ?? 0) + 1;
    }
  }
}

function addRoundEncounters(encounterCounts: Record<string, number>, tables: TableAssignment[]) {
  for (const table of tables) {
    addTableEncounters(encounterCounts, table.playerIds);
  }
}

function scoreEncounterDistribution(encounterCounts: Record<string, number>): [number, number, number] {
  let maxPairMeetCount = 0;
  let repeatedMeetingsExcess = 0;
  let quadraticPenalty = 0;

  for (const count of Object.values(encounterCounts)) {
    maxPairMeetCount = Math.max(maxPairMeetCount, count);
    if (count > 1) {
      repeatedMeetingsExcess += count - 1;
    }
    quadraticPenalty += count * count;
  }

  return [maxPairMeetCount, repeatedMeetingsExcess, quadraticPenalty];
}

function isScoreBetter(candidate: [number, number, number], baseline: [number, number, number] | null) {
  if (!baseline) {
    return true;
  }

  if (candidate[0] !== baseline[0]) {
    return candidate[0] < baseline[0];
  }

  if (candidate[1] !== baseline[1]) {
    return candidate[1] < baseline[1];
  }

  return candidate[2] < baseline[2];
}

function generateMinRepeatRoundPairings(
  playerIds: string[],
  encounterCounts: Record<string, number>,
  rng: () => number
): TableAssignment[] {
  const available = shuffleWithRng(playerIds, rng);
  const tables: TableAssignment[] = [];

  let tableIndex = 0;
  while (available.length > 0) {
    const seed = available.shift();
    if (!seed) {
      break;
    }

    const tablePlayers = [seed];
    while (tablePlayers.length < 4) {
      let bestIndex = 0;
      let bestScore = Number.POSITIVE_INFINITY;

      for (let i = 0; i < available.length; i += 1) {
        const candidate = available[i];
        let repeatPenalty = 0;
        let maxPairPenalty = 0;

        for (const player of tablePlayers) {
          const count = encounterCounts[pairKey(candidate, player)] ?? 0;
          repeatPenalty += count;
          maxPairPenalty = Math.max(maxPairPenalty, count);
        }

        const tieBreakNoise = rng() * 0.001;
        const score = maxPairPenalty * 1000 + repeatPenalty * 100 + tieBreakNoise;

        if (score < bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }

      tablePlayers.push(available.splice(bestIndex, 1)[0]);
    }

    tables.push({
      tableIndex,
      playerIds: tablePlayers
    });
    tableIndex += 1;
  }

  return tables;
}

export function buildEncounterCountsFromRounds(rounds: any[]): Record<string, number> {
  const encounterCounts: Record<string, number> = {};

  for (const round of rounds) {
    const tables = (round.tables ?? {}) as Record<string, { playerIds?: string[] }>;
    for (const table of Object.values(tables)) {
      addTableEncounters(encounterCounts, table.playerIds ?? []);
    }
  }

  return encounterCounts;
}

export function generateTournamentPairings({
  playerIds,
  standingsPoints,
  encounterCounts
}: PairingInput): TableAssignment[] {
  if (playerIds.length < 4 || playerIds.length % 4 !== 0) {
    throw new Error('Tournament participant count must be a multiple of 4.');
  }

  const sortedPlayers = [...playerIds].sort((a, b) => {
    const pointsDiff = (standingsPoints[b] ?? 0) - (standingsPoints[a] ?? 0);
    if (pointsDiff !== 0) {
      return pointsDiff;
    }

    return a.localeCompare(b);
  });

  const rankIndex: Record<string, number> = {};
  sortedPlayers.forEach((playerId, index) => {
    rankIndex[playerId] = index;
  });

  const available = [...sortedPlayers];
  const tables: TableAssignment[] = [];

  const repeatWeight = 100;
  const rankSpreadWeight = 1;

  const takeBestCandidate = (seedTable: string[]) => {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < available.length; i += 1) {
      const candidate = available[i];

      let repeatPenalty = 0;
      let rankSpreadPenalty = 0;

      for (const player of seedTable) {
        repeatPenalty += encounterCounts[pairKey(candidate, player)] ?? 0;
        rankSpreadPenalty += Math.abs((rankIndex[candidate] ?? 0) - (rankIndex[player] ?? 0));
      }

      const score = repeatPenalty * repeatWeight + rankSpreadPenalty * rankSpreadWeight;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return available.splice(bestIndex, 1)[0];
  };

  let tableIndex = 0;
  while (available.length > 0) {
    const seed = available.shift();
    if (!seed) {
      break;
    }

    const tablePlayers = [seed];
    while (tablePlayers.length < 4) {
      tablePlayers.push(takeBestCandidate(tablePlayers));
    }

    tables.push({
      tableIndex,
      playerIds: tablePlayers
    });

    tableIndex += 1;
  }

  return tables;
}

export function generatePrecomputedTournamentSchedule(input: {
  playerIds: string[];
  totalRounds: number;
  attempts?: number;
}): TableAssignment[][] {
  const { playerIds, totalRounds, attempts = 120 } = input;

  if (playerIds.length < 4 || playerIds.length % 4 !== 0) {
    throw new Error('Tournament participant count must be a multiple of 4.');
  }

  if (totalRounds <= 0) {
    throw new Error('Tournament total rounds must be greater than zero.');
  }

  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error('Tournament participants must be unique.');
  }

  const sortedIds = [...playerIds].sort((a, b) => a.localeCompare(b));
  const baseSeed = stringHash(`${sortedIds.join('|')}::${totalRounds}`);

  let bestSchedule: TableAssignment[][] | null = null;
  let bestScore: [number, number, number] | null = null;

  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    const rng = createSeededRng(baseSeed + attempt * 7919);
    const encounterCounts: Record<string, number> = {};
    const schedule: TableAssignment[][] = [];

    for (let roundNumber = 1; roundNumber <= totalRounds; roundNumber += 1) {
      const roundTables = generateMinRepeatRoundPairings(playerIds, encounterCounts, rng);
      schedule.push(roundTables);
      addRoundEncounters(encounterCounts, roundTables);
    }

    const score = scoreEncounterDistribution(encounterCounts);
    if (isScoreBetter(score, bestScore)) {
      bestSchedule = schedule;
      bestScore = score;
    }
  }

  if (!bestSchedule) {
    throw new Error('Unable to generate tournament schedule.');
  }

  return bestSchedule;
}
