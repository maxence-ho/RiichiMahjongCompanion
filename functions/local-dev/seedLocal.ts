import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { Socket } from 'node:net';

interface SeedUser {
  uid: string;
  email: string;
  password: string;
  displayName: string;
  role: 'admin' | 'member';
}

interface Rules {
  startingPoints: number;
  returnPoints: number;
  uma: [number, number, number, number];
  oka: number;
  scoreSum: number;
  rounding: 'nearest_100' | 'none';
}

interface TournamentContext {
  roundId: string;
  tableIndex: number;
}

interface ValidatedGameSeed {
  gameId: string;
  versionId: string;
  createdBy: string;
  participants: string[];
  finalScores: Record<string, number>;
  competitionId: string;
  createdAtOffset: number;
  tournamentContext?: TournamentContext;
}

interface PendingGameSeed {
  gameId: string;
  proposalId: string;
  createdBy: string;
  participants: string[];
  finalScores: Record<string, number>;
  approvedBy: string[];
  competitionId: string;
  createdAtOffset: number;
  tournamentContext?: TournamentContext;
}

interface TournamentTableSeed {
  playerIds: string[];
  status: 'awaiting_result' | 'pending_validation' | 'validated' | 'disputed';
  proposalId?: string | null;
  gameId?: string | null;
}

function ensureEmulatorEnv() {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
}

function parseHostPort(hostValue: string): { host: string; port: number } {
  const [host, portText] = hostValue.split(':');
  const port = Number(portText);
  return {
    host: host || '127.0.0.1',
    port: Number.isFinite(port) ? port : 0
  };
}

async function isTcpReachable(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    if (!host || !port) {
      resolve(false);
      return;
    }

    const socket = new Socket();
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function assertEmulatorsAvailable() {
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST as string;
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST as string;

  const authEndpoint = parseHostPort(authHost);
  const firestoreEndpoint = parseHostPort(firestoreHost);

  const [authOk, firestoreOk] = await Promise.all([
    isTcpReachable(authEndpoint.host, authEndpoint.port),
    isTcpReachable(firestoreEndpoint.host, firestoreEndpoint.port)
  ]);

  const missing: string[] = [];
  if (!authOk) {
    missing.push(`Auth emulator (${authHost})`);
  }
  if (!firestoreOk) {
    missing.push(`Firestore emulator (${firestoreHost})`);
  }

  if (missing.length > 0) {
    throw new Error(
      [
        `Missing emulator(s): ${missing.join(', ')}.`,
        'Start emulators first with: npm run dev:functions',
        'Or run one-shot seed with: npm run seed:local:exec'
      ].join('\n')
    );
  }
}

function computeGameOutcome(
  participants: string[],
  finalScores: Record<string, number>,
  rules: Rules
): { ranks: Record<string, number>; totalPoints: Record<string, number> } {
  const normalizedScores = participants.map((userId) => ({
    userId,
    score:
      rules.rounding === 'nearest_100' ? Math.round(finalScores[userId] / 100) * 100 : finalScores[userId]
  }));

  normalizedScores.sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId));

  const ranks: Record<string, number> = {};
  const totalPoints: Record<string, number> = {};

  let cursor = 0;
  while (cursor < normalizedScores.length) {
    const score = normalizedScores[cursor].score;
    const tieGroup = normalizedScores.filter((entry) => entry.score === score);
    const groupStartPosition = cursor + 1;
    const groupSize = tieGroup.length;
    const occupiedUma = rules.uma.slice(groupStartPosition - 1, groupStartPosition - 1 + groupSize);
    const averageUma = occupiedUma.reduce((sum, value) => sum + value, 0) / groupSize;

    const topShare = groupStartPosition === 1 && rules.oka !== 0 ? rules.oka / groupSize : 0;

    for (const entry of tieGroup) {
      const raw = (entry.score - rules.returnPoints) / 1000;
      const total = Math.round((raw + averageUma + topShare) * 10) / 10;
      ranks[entry.userId] = groupStartPosition;
      totalPoints[entry.userId] = total;
    }

    cursor += groupSize;
  }

  return { ranks, totalPoints };
}

function validationRequestId(proposalId: string, userId: string) {
  return `${proposalId}_${userId}`;
}

function buildUserApprovals(
  requiredUserIds: string[],
  approvedBy: string[],
  rejectedBy: string[] = []
): Record<string, 'pending' | 'approved' | 'rejected'> {
  const approvedSet = new Set(approvedBy);
  const rejectedSet = new Set(rejectedBy);
  const approvals: Record<string, 'pending' | 'approved' | 'rejected'> = {};

  for (const userId of requiredUserIds) {
    if (rejectedSet.has(userId)) {
      approvals[userId] = 'rejected';
    } else if (approvedSet.has(userId)) {
      approvals[userId] = 'approved';
    } else {
      approvals[userId] = 'pending';
    }
  }

  return approvals;
}

function assertValidGame(
  gameId: string,
  participants: string[],
  finalScores: Record<string, number>,
  rules: Rules,
  approvedBy?: string[]
) {
  if (participants.length !== 4) {
    throw new Error(`Game ${gameId}: expected 4 participants, got ${participants.length}.`);
  }

  const uniqueParticipants = new Set(participants);
  if (uniqueParticipants.size !== participants.length) {
    throw new Error(`Game ${gameId}: participants must be unique.`);
  }

  const scoreKeys = Object.keys(finalScores);
  if (scoreKeys.length !== participants.length) {
    throw new Error(`Game ${gameId}: score map keys do not match participants.`);
  }

  for (const participant of participants) {
    if (!(participant in finalScores)) {
      throw new Error(`Game ${gameId}: missing score for participant ${participant}.`);
    }
  }

  for (const key of scoreKeys) {
    if (!uniqueParticipants.has(key)) {
      throw new Error(`Game ${gameId}: unexpected score key ${key}.`);
    }
  }

  const scoreSum = scoreKeys.reduce((sum, userId) => sum + Number(finalScores[userId]), 0);
  if (scoreSum !== rules.scoreSum) {
    throw new Error(`Game ${gameId}: invalid score sum ${scoreSum}, expected ${rules.scoreSum}.`);
  }

  if (approvedBy) {
    for (const userId of approvedBy) {
      if (!uniqueParticipants.has(userId)) {
        throw new Error(`Game ${gameId}: approvedBy contains non-participant ${userId}.`);
      }
    }
  }
}

function tableRecord(tables: TournamentTableSeed[]) {
  const record: Record<
    string,
    {
      tableIndex: number;
      playerIds: string[];
      status: 'awaiting_result' | 'pending_validation' | 'validated' | 'disputed';
      proposalId: string | null;
      gameId: string | null;
    }
  > = {};

  for (let i = 0; i < tables.length; i += 1) {
    const table = tables[i];
    record[String(i)] = {
      tableIndex: i,
      playerIds: table.playerIds,
      status: table.status,
      proposalId: table.proposalId ?? null,
      gameId: table.gameId ?? null
    };
  }

  return record;
}

async function clearAuthUsers() {
  const auth = getAuth();
  let pageToken: string | undefined;

  do {
    const page = await auth.listUsers(1000, pageToken);
    if (page.users.length > 0) {
      const userIds = page.users.map((user) => user.uid);
      const result = await auth.deleteUsers(userIds);
      if (result.failureCount > 0) {
        throw new Error(`Failed to delete ${result.failureCount} auth users during reset.`);
      }
    }

    pageToken = page.pageToken;
  } while (pageToken);
}

async function clearFirestore(projectId: string) {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST as string;
  const url = `http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`;
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to clear Firestore emulator (${response.status}): ${body}`);
  }
}

async function createAuthUsers(users: SeedUser[]) {
  const auth = getAuth();
  for (const user of users) {
    await auth.createUser({
      uid: user.uid,
      email: user.email,
      password: user.password,
      displayName: user.displayName,
      emailVerified: true
    });
  }
}

async function seed() {
  ensureEmulatorEnv();
  await assertEmulatorsAvailable();

  const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? 'demo-mahjong-club';

  if (!getApps().length) {
    initializeApp({ projectId });
  }

  const db = getFirestore();

  await clearAuthUsers();
  await clearFirestore(projectId);

  const clubId = 'club_seed_main';
  const championshipCompetitionId = 'competition_seed_championship_2026';
  const tournamentPerformanceCompetitionId = 'competition_seed_tournament_performance_2026';
  const tournamentPrecomputedCompetitionId = 'competition_seed_tournament_precomputed_2026';

  const clubDefaultRules: Rules = {
    startingPoints: 25000,
    returnPoints: 30000,
    uma: [20, 10, -10, -20],
    oka: 0,
    scoreSum: 100000,
    rounding: 'nearest_100'
  };

  const performanceTournamentRules: Rules = {
    startingPoints: 25000,
    returnPoints: 30000,
    uma: [15, 5, -5, -15],
    oka: 0,
    scoreSum: 100000,
    rounding: 'nearest_100'
  };

  const precomputedTournamentRules: Rules = {
    startingPoints: 25000,
    returnPoints: 30000,
    uma: [30, 10, -10, -30],
    oka: 0,
    scoreSum: 100000,
    rounding: 'nearest_100'
  };

  const memberProfiles = [
    { uid: 'u_01', displayName: 'alice@mahjong.local', email: 'alice@mahjong.local' },
    { uid: 'u_02', displayName: 'bob@mahjong.local', email: 'bob@mahjong.local' },
    { uid: 'u_03', displayName: 'charlie@mahjong.local', email: 'charlie@mahjong.local' },
    { uid: 'u_04', displayName: 'diana@mahjong.local', email: 'diana@mahjong.local' },
    { uid: 'u_05', displayName: 'evan@mahjong.local', email: 'evan@mahjong.local' },
    { uid: 'u_06', displayName: 'fiona@mahjong.local', email: 'fiona@mahjong.local' },
    { uid: 'u_07', displayName: 'george@mahjong.local', email: 'george@mahjong.local' },
    { uid: 'u_08', displayName: 'hanna@mahjong.local', email: 'hanna@mahjong.local' },
    { uid: 'u_09', displayName: 'ivan@mahjong.local', email: 'ivan@mahjong.local' },
    { uid: 'u_10', displayName: 'julia@mahjong.local', email: 'julia@mahjong.local' },
    { uid: 'u_11', displayName: 'kevin@mahjong.local', email: 'kevin@mahjong.local' },
    { uid: 'u_12', displayName: 'lina@mahjong.local', email: 'lina@mahjong.local' }
  ];

  const seedUsers: SeedUser[] = [
    {
      uid: 'u_admin',
      email: 'admin@mahjong.local',
      password: 'Test1234!',
      displayName: 'admin@mahjong.local',
      role: 'admin'
    },
    ...memberProfiles.map((profile) => ({
      uid: profile.uid,
      email: profile.email,
      password: 'Test1234!',
      displayName: profile.displayName,
      role: 'member' as const
    }))
  ];

  await createAuthUsers(seedUsers);

  const championshipPlayers = memberProfiles.map((profile) => profile.uid);
  const tournamentPlayers = [...championshipPlayers];

  const competitionRulesById: Record<string, Rules> = {
    [championshipCompetitionId]: clubDefaultRules,
    [tournamentPerformanceCompetitionId]: performanceTournamentRules,
    [tournamentPrecomputedCompetitionId]: precomputedTournamentRules
  };

  const perfRound1Id = `${tournamentPerformanceCompetitionId}_round_01`;
  const perfRound2Id = `${tournamentPerformanceCompetitionId}_round_02`;
  const perfRound3Id = `${tournamentPerformanceCompetitionId}_round_03`;

  const preRound1Id = `${tournamentPrecomputedCompetitionId}_round_01`;
  const preRound2Id = `${tournamentPrecomputedCompetitionId}_round_02`;
  const preRound3Id = `${tournamentPrecomputedCompetitionId}_round_03`;
  const preRound4Id = `${tournamentPrecomputedCompetitionId}_round_04`;

  const validatedGames: ValidatedGameSeed[] = [
    {
      gameId: 'game_seed_champ_validated_1',
      versionId: 'version_seed_champ_validated_1',
      createdBy: 'u_admin',
      competitionId: championshipCompetitionId,
      participants: ['u_01', 'u_02', 'u_03', 'u_04'],
      finalScores: { u_01: 39800, u_02: 27100, u_03: 21100, u_04: 12000 },
      createdAtOffset: 20
    },
    {
      gameId: 'game_seed_champ_validated_2',
      versionId: 'version_seed_champ_validated_2',
      createdBy: 'u_admin',
      competitionId: championshipCompetitionId,
      participants: ['u_05', 'u_06', 'u_07', 'u_08'],
      finalScores: { u_05: 36200, u_06: 28900, u_07: 21400, u_08: 13500 },
      createdAtOffset: 21
    },
    {
      gameId: 'game_seed_champ_validated_3',
      versionId: 'version_seed_champ_validated_3',
      createdBy: 'u_admin',
      competitionId: championshipCompetitionId,
      participants: ['u_09', 'u_10', 'u_11', 'u_12'],
      finalScores: { u_09: 41500, u_10: 25700, u_11: 20100, u_12: 12700 },
      createdAtOffset: 22
    },
    {
      gameId: 'game_seed_champ_validated_4',
      versionId: 'version_seed_champ_validated_4',
      createdBy: 'u_01',
      competitionId: championshipCompetitionId,
      participants: ['u_01', 'u_05', 'u_09', 'u_12'],
      finalScores: { u_01: 33300, u_05: 30400, u_09: 22300, u_12: 14000 },
      createdAtOffset: 23
    },
    {
      gameId: 'game_seed_champ_validated_5',
      versionId: 'version_seed_champ_validated_5',
      createdBy: 'u_02',
      competitionId: championshipCompetitionId,
      participants: ['u_02', 'u_06', 'u_10', 'u_11'],
      finalScores: { u_02: 34700, u_06: 29200, u_10: 21800, u_11: 14300 },
      createdAtOffset: 24
    },
    {
      gameId: 'game_seed_champ_validated_6',
      versionId: 'version_seed_champ_validated_6',
      createdBy: 'u_03',
      competitionId: championshipCompetitionId,
      participants: ['u_03', 'u_04', 'u_07', 'u_08'],
      finalScores: { u_03: 32500, u_04: 30000, u_07: 23000, u_08: 14500 },
      createdAtOffset: 25
    },
    {
      gameId: 'game_seed_perf_r1_t0_valid',
      versionId: 'version_seed_perf_r1_t0_valid',
      createdBy: 'u_01',
      competitionId: tournamentPerformanceCompetitionId,
      participants: ['u_01', 'u_02', 'u_03', 'u_04'],
      finalScores: { u_01: 35200, u_02: 30100, u_03: 20800, u_04: 13900 },
      createdAtOffset: 30,
      tournamentContext: { roundId: perfRound1Id, tableIndex: 0 }
    },
    {
      gameId: 'game_seed_perf_r1_t1_valid',
      versionId: 'version_seed_perf_r1_t1_valid',
      createdBy: 'u_05',
      competitionId: tournamentPerformanceCompetitionId,
      participants: ['u_05', 'u_06', 'u_07', 'u_08'],
      finalScores: { u_05: 37800, u_06: 28000, u_07: 20700, u_08: 13500 },
      createdAtOffset: 31,
      tournamentContext: { roundId: perfRound1Id, tableIndex: 1 }
    },
    {
      gameId: 'game_seed_perf_r1_t2_valid',
      versionId: 'version_seed_perf_r1_t2_valid',
      createdBy: 'u_09',
      competitionId: tournamentPerformanceCompetitionId,
      participants: ['u_09', 'u_10', 'u_11', 'u_12'],
      finalScores: { u_09: 33400, u_10: 31800, u_11: 20500, u_12: 14300 },
      createdAtOffset: 32,
      tournamentContext: { roundId: perfRound1Id, tableIndex: 2 }
    },
    {
      gameId: 'game_seed_perf_r2_t2_valid',
      versionId: 'version_seed_perf_r2_t2_valid',
      createdBy: 'u_06',
      competitionId: tournamentPerformanceCompetitionId,
      participants: ['u_06', 'u_08', 'u_10', 'u_12'],
      finalScores: { u_06: 34400, u_08: 29600, u_10: 22400, u_12: 13600 },
      createdAtOffset: 33,
      tournamentContext: { roundId: perfRound2Id, tableIndex: 2 }
    },
    {
      gameId: 'game_seed_pre_r1_t0_valid',
      versionId: 'version_seed_pre_r1_t0_valid',
      createdBy: 'u_01',
      competitionId: tournamentPrecomputedCompetitionId,
      participants: ['u_01', 'u_06', 'u_11', 'u_04'],
      finalScores: { u_01: 36100, u_06: 28600, u_11: 21900, u_04: 13400 },
      createdAtOffset: 40,
      tournamentContext: { roundId: preRound1Id, tableIndex: 0 }
    },
    {
      gameId: 'game_seed_pre_r1_t1_valid',
      versionId: 'version_seed_pre_r1_t1_valid',
      createdBy: 'u_02',
      competitionId: tournamentPrecomputedCompetitionId,
      participants: ['u_02', 'u_07', 'u_12', 'u_05'],
      finalScores: { u_02: 33900, u_07: 30900, u_12: 21400, u_05: 13800 },
      createdAtOffset: 41,
      tournamentContext: { roundId: preRound1Id, tableIndex: 1 }
    },
    {
      gameId: 'game_seed_pre_r1_t2_valid',
      versionId: 'version_seed_pre_r1_t2_valid',
      createdBy: 'u_03',
      competitionId: tournamentPrecomputedCompetitionId,
      participants: ['u_03', 'u_08', 'u_09', 'u_10'],
      finalScores: { u_03: 35200, u_08: 28700, u_09: 22600, u_10: 13500 },
      createdAtOffset: 42,
      tournamentContext: { roundId: preRound1Id, tableIndex: 2 }
    },
    {
      gameId: 'game_seed_pre_r2_t1_valid',
      versionId: 'version_seed_pre_r2_t1_valid',
      createdBy: 'u_02',
      competitionId: tournamentPrecomputedCompetitionId,
      participants: ['u_02', 'u_08', 'u_10', 'u_06'],
      finalScores: { u_02: 34600, u_08: 29500, u_10: 21800, u_06: 14100 },
      createdAtOffset: 43,
      tournamentContext: { roundId: preRound2Id, tableIndex: 1 }
    }
  ];

  const pendingGames: PendingGameSeed[] = [
    {
      gameId: 'game_seed_champ_pending_1',
      proposalId: 'proposal_seed_champ_pending_1',
      createdBy: 'u_admin',
      competitionId: championshipCompetitionId,
      participants: ['u_admin', 'u_01', 'u_02', 'u_03'],
      finalScores: { u_admin: 34100, u_01: 28600, u_02: 22100, u_03: 15200 },
      approvedBy: ['u_01'],
      createdAtOffset: 60
    },
    {
      gameId: 'game_seed_champ_pending_2',
      proposalId: 'proposal_seed_champ_pending_2',
      createdBy: 'u_09',
      competitionId: championshipCompetitionId,
      participants: ['u_09', 'u_10', 'u_11', 'u_12'],
      finalScores: { u_09: 36000, u_10: 29000, u_11: 21000, u_12: 14000 },
      approvedBy: [],
      createdAtOffset: 61
    },
    {
      gameId: 'game_seed_perf_r2_t0_pending',
      proposalId: 'proposal_seed_perf_r2_t0_pending',
      createdBy: 'u_01',
      competitionId: tournamentPerformanceCompetitionId,
      participants: ['u_01', 'u_05', 'u_09', 'u_02'],
      finalScores: { u_01: 32900, u_05: 30700, u_09: 22300, u_02: 14100 },
      approvedBy: ['u_01', 'u_05'],
      createdAtOffset: 62,
      tournamentContext: { roundId: perfRound2Id, tableIndex: 0 }
    },
    {
      gameId: 'game_seed_pre_r2_t0_pending',
      proposalId: 'proposal_seed_pre_r2_t0_pending',
      createdBy: 'u_01',
      competitionId: tournamentPrecomputedCompetitionId,
      participants: ['u_01', 'u_07', 'u_09', 'u_05'],
      finalScores: { u_01: 33200, u_07: 30400, u_09: 22100, u_05: 14300 },
      approvedBy: ['u_01', 'u_07'],
      createdAtOffset: 63,
      tournamentContext: { roundId: preRound2Id, tableIndex: 0 }
    }
  ];

  const baseTimestamp = Date.parse('2026-02-01T12:00:00.000Z');
  const at = (minutesOffset: number) => Timestamp.fromMillis(baseTimestamp + minutesOffset * 60_000);

  for (const game of validatedGames) {
    assertValidGame(
      game.gameId,
      game.participants,
      game.finalScores,
      competitionRulesById[game.competitionId]
    );
  }

  for (const game of pendingGames) {
    assertValidGame(
      game.gameId,
      game.participants,
      game.finalScores,
      competitionRulesById[game.competitionId],
      game.approvedBy
    );
  }

  const batch = db.batch();

  batch.set(db.doc(`clubs/${clubId}`), {
    name: 'Mahjong Club Seed',
    createdBy: 'u_admin',
    createdAt: at(0),
    defaultRules: clubDefaultRules
  });

  for (const user of seedUsers) {
    batch.set(db.doc(`users/${user.uid}`), {
      displayName: user.displayName,
      email: user.email,
      clubIds: [clubId],
      activeClubId: clubId,
      fcmTokens: [],
      createdAt: at(1)
    });

    batch.set(db.doc(`clubs/${clubId}/members/${user.uid}`), {
      role: user.role,
      joinedAt: at(2),
      displayNameCache: user.displayName
    });
  }

  batch.set(db.doc(`clubs/${clubId}/competitions/${championshipCompetitionId}`), {
    name: 'Championnat Seed 2026',
    type: 'championship',
    status: 'active',
    validationEnabled: true,
    startAt: at(3),
    endAt: null,
    rules: {
      mode: 'inherit'
    },
    createdBy: 'u_admin',
    createdAt: at(3),
    updatedAt: at(3)
  });

  batch.set(db.doc(`clubs/${clubId}/competitions/${tournamentPerformanceCompetitionId}`), {
    name: 'Tournoi Seed Performance 2026',
    type: 'tournament',
    status: 'active',
    validationEnabled: true,
    startAt: at(4),
    endAt: null,
    rules: {
      mode: 'override',
      overrideRules: performanceTournamentRules
    },
    tournamentConfig: {
      participantUserIds: tournamentPlayers,
      totalRounds: 3,
      pairingAlgorithm: 'performance_swiss'
    },
    tournamentState: {
      activeRoundNumber: 2,
      lastCompletedRound: 1
    },
    createdBy: 'u_admin',
    createdAt: at(4),
    updatedAt: at(4)
  });

  batch.set(db.doc(`clubs/${clubId}/competitions/${tournamentPrecomputedCompetitionId}`), {
    name: 'Tournoi Seed Precomputed 2026',
    type: 'tournament',
    status: 'active',
    validationEnabled: true,
    startAt: at(5),
    endAt: null,
    rules: {
      mode: 'override',
      overrideRules: precomputedTournamentRules
    },
    tournamentConfig: {
      participantUserIds: tournamentPlayers,
      totalRounds: 4,
      pairingAlgorithm: 'precomputed_min_repeats'
    },
    tournamentState: {
      activeRoundNumber: 2,
      lastCompletedRound: 1
    },
    createdBy: 'u_admin',
    createdAt: at(5),
    updatedAt: at(5)
  });

  batch.set(db.doc(`tournamentRounds/${perfRound1Id}`), {
    clubId,
    competitionId: tournamentPerformanceCompetitionId,
    roundNumber: 1,
    status: 'completed',
    tables: tableRecord([
      {
        playerIds: ['u_01', 'u_02', 'u_03', 'u_04'],
        status: 'validated',
        gameId: 'game_seed_perf_r1_t0_valid'
      },
      {
        playerIds: ['u_05', 'u_06', 'u_07', 'u_08'],
        status: 'validated',
        gameId: 'game_seed_perf_r1_t1_valid'
      },
      {
        playerIds: ['u_09', 'u_10', 'u_11', 'u_12'],
        status: 'validated',
        gameId: 'game_seed_perf_r1_t2_valid'
      }
    ]),
    createdAt: at(6),
    updatedAt: at(6)
  });

  batch.set(db.doc(`tournamentRounds/${perfRound2Id}`), {
    clubId,
    competitionId: tournamentPerformanceCompetitionId,
    roundNumber: 2,
    status: 'active',
    tables: tableRecord([
      {
        playerIds: ['u_01', 'u_05', 'u_09', 'u_02'],
        status: 'pending_validation',
        gameId: 'game_seed_perf_r2_t0_pending',
        proposalId: 'proposal_seed_perf_r2_t0_pending'
      },
      {
        playerIds: ['u_03', 'u_07', 'u_11', 'u_04'],
        status: 'awaiting_result'
      },
      {
        playerIds: ['u_06', 'u_08', 'u_10', 'u_12'],
        status: 'validated',
        gameId: 'game_seed_perf_r2_t2_valid'
      }
    ]),
    createdAt: at(7),
    updatedAt: at(7)
  });

  batch.set(db.doc(`tournamentRounds/${perfRound3Id}`), {
    clubId,
    competitionId: tournamentPerformanceCompetitionId,
    roundNumber: 3,
    status: 'scheduled',
    tables: tableRecord([
      {
        playerIds: ['u_01', 'u_06', 'u_11', 'u_12'],
        status: 'awaiting_result'
      },
      {
        playerIds: ['u_02', 'u_07', 'u_08', 'u_09'],
        status: 'awaiting_result'
      },
      {
        playerIds: ['u_03', 'u_04', 'u_05', 'u_10'],
        status: 'awaiting_result'
      }
    ]),
    createdAt: at(8),
    updatedAt: at(8)
  });

  batch.set(db.doc(`tournamentRounds/${preRound1Id}`), {
    clubId,
    competitionId: tournamentPrecomputedCompetitionId,
    roundNumber: 1,
    status: 'completed',
    tables: tableRecord([
      {
        playerIds: ['u_01', 'u_06', 'u_11', 'u_04'],
        status: 'validated',
        gameId: 'game_seed_pre_r1_t0_valid'
      },
      {
        playerIds: ['u_02', 'u_07', 'u_12', 'u_05'],
        status: 'validated',
        gameId: 'game_seed_pre_r1_t1_valid'
      },
      {
        playerIds: ['u_03', 'u_08', 'u_09', 'u_10'],
        status: 'validated',
        gameId: 'game_seed_pre_r1_t2_valid'
      }
    ]),
    createdAt: at(9),
    updatedAt: at(9)
  });

  batch.set(db.doc(`tournamentRounds/${preRound2Id}`), {
    clubId,
    competitionId: tournamentPrecomputedCompetitionId,
    roundNumber: 2,
    status: 'active',
    tables: tableRecord([
      {
        playerIds: ['u_01', 'u_07', 'u_09', 'u_05'],
        status: 'pending_validation',
        gameId: 'game_seed_pre_r2_t0_pending',
        proposalId: 'proposal_seed_pre_r2_t0_pending'
      },
      {
        playerIds: ['u_02', 'u_08', 'u_10', 'u_06'],
        status: 'validated',
        gameId: 'game_seed_pre_r2_t1_valid'
      },
      {
        playerIds: ['u_03', 'u_04', 'u_11', 'u_12'],
        status: 'awaiting_result'
      }
    ]),
    createdAt: at(10),
    updatedAt: at(10)
  });

  batch.set(db.doc(`tournamentRounds/${preRound3Id}`), {
    clubId,
    competitionId: tournamentPrecomputedCompetitionId,
    roundNumber: 3,
    status: 'scheduled',
    tables: tableRecord([
      {
        playerIds: ['u_01', 'u_08', 'u_11', 'u_10'],
        status: 'awaiting_result'
      },
      {
        playerIds: ['u_02', 'u_03', 'u_09', 'u_12'],
        status: 'awaiting_result'
      },
      {
        playerIds: ['u_04', 'u_05', 'u_06', 'u_07'],
        status: 'awaiting_result'
      }
    ]),
    createdAt: at(11),
    updatedAt: at(11)
  });

  batch.set(db.doc(`tournamentRounds/${preRound4Id}`), {
    clubId,
    competitionId: tournamentPrecomputedCompetitionId,
    roundNumber: 4,
    status: 'scheduled',
    tables: tableRecord([
      {
        playerIds: ['u_01', 'u_03', 'u_06', 'u_12'],
        status: 'awaiting_result'
      },
      {
        playerIds: ['u_02', 'u_04', 'u_05', 'u_11'],
        status: 'awaiting_result'
      },
      {
        playerIds: ['u_07', 'u_08', 'u_09', 'u_10'],
        status: 'awaiting_result'
      }
    ]),
    createdAt: at(12),
    updatedAt: at(12)
  });

  const leaderboardTotalsByCompetition: Record<
    string,
    Record<string, { totalPoints: number; gamesPlayed: number }>
  > = {};

  for (const game of validatedGames) {
    const rules = competitionRulesById[game.competitionId];
    const computed = computeGameOutcome(game.participants, game.finalScores, rules);

    batch.set(db.doc(`games/${game.gameId}`), {
      clubId,
      createdBy: game.createdBy,
      status: 'validated',
      participants: game.participants,
      competitionIds: [game.competitionId],
      activeVersionId: game.versionId,
      ...(game.tournamentContext
        ? {
            tournamentContext: {
              competitionId: game.competitionId,
              roundId: game.tournamentContext.roundId,
              tableIndex: game.tournamentContext.tableIndex
            }
          }
        : {}),
      createdAt: at(game.createdAtOffset),
      updatedAt: at(game.createdAtOffset)
    });

    batch.set(db.doc(`gameVersions/${game.versionId}`), {
      gameId: game.gameId,
      clubId,
      versionNumber: 1,
      participants: game.participants,
      finalScores: game.finalScores,
      competitionIds: [game.competitionId],
      rulesSnapshot: rules,
      computed,
      createdBy: game.createdBy,
      createdAt: at(game.createdAtOffset)
    });

    const competitionTotals = leaderboardTotalsByCompetition[game.competitionId] ?? {};
    for (const participant of game.participants) {
      const entry = competitionTotals[participant] ?? { totalPoints: 0, gamesPlayed: 0 };
      entry.totalPoints += computed.totalPoints[participant] ?? 0;
      entry.gamesPlayed += 1;
      competitionTotals[participant] = entry;
    }
    leaderboardTotalsByCompetition[game.competitionId] = competitionTotals;
  }

  for (const game of pendingGames) {
    const rules = competitionRulesById[game.competitionId];
    const computedPreview = computeGameOutcome(game.participants, game.finalScores, rules);
    const userApprovals = buildUserApprovals(game.participants, game.approvedBy);

    batch.set(db.doc(`games/${game.gameId}`), {
      clubId,
      createdBy: game.createdBy,
      status: 'pending_validation',
      participants: game.participants,
      competitionIds: [game.competitionId],
      activeVersionId: null,
      pendingAction: {
        type: 'create',
        proposalId: game.proposalId
      },
      ...(game.tournamentContext
        ? {
            tournamentContext: {
              competitionId: game.competitionId,
              roundId: game.tournamentContext.roundId,
              tableIndex: game.tournamentContext.tableIndex
            }
          }
        : {}),
      createdAt: at(game.createdAtOffset),
      updatedAt: at(game.createdAtOffset)
    });

    batch.set(db.doc(`editProposals/${game.proposalId}`), {
      clubId,
      gameId: game.gameId,
      type: 'create',
      status: 'pending_validation',
      fromVersionId: null,
      proposedVersion: {
        participants: game.participants,
        finalScores: game.finalScores,
        competitionIds: [game.competitionId]
      },
      resolvedRulesSnapshot: rules,
      computedPreview,
      validation: {
        requiredUserIds: game.participants,
        userApprovals,
        approvedBy: game.approvedBy,
        rejectedBy: [],
        createdAt: at(game.createdAtOffset),
        deadlineAt: null
      },
      ...(game.tournamentContext
        ? {
            tournamentContext: {
              competitionId: game.competitionId,
              roundId: game.tournamentContext.roundId,
              tableIndex: game.tournamentContext.tableIndex,
              roundRefPath: `tournamentRounds/${game.tournamentContext.roundId}`
            }
          }
        : {}),
      createdBy: game.createdBy,
      createdAt: at(game.createdAtOffset),
      updatedAt: at(game.createdAtOffset)
    });

    for (const participant of game.participants) {
      batch.set(
        db.doc(`validationRequests/${validationRequestId(game.proposalId, participant)}`),
        {
          clubId,
          userId: participant,
          type: 'game_create',
          proposalId: game.proposalId,
          gameId: game.gameId,
          status: game.approvedBy.includes(participant) ? 'approved' : 'pending',
          createdAt: at(game.createdAtOffset),
          updatedAt: at(game.createdAtOffset)
        }
      );
    }
  }

  for (const [competitionId, totals] of Object.entries(leaderboardTotalsByCompetition)) {
    for (const [userId, stats] of Object.entries(totals)) {
      batch.set(db.doc(`competitionLeaderboardEntries/${clubId}_${competitionId}_${userId}`), {
        clubId,
        competitionId,
        userId,
        totalPoints: Math.round(stats.totalPoints * 10) / 10,
        gamesPlayed: stats.gamesPlayed,
        updatedAt: at(120)
      });
    }
  }

  await batch.commit();

  console.log('\nSeed completed in local emulators (deterministic reset).');
  console.log('Project ID:', projectId);
  console.log('Club ID:', clubId);
  console.log('Championship ID:', championshipCompetitionId);
  console.log('Tournament (performance) ID:', tournamentPerformanceCompetitionId);
  console.log('Tournament (precomputed) ID:', tournamentPrecomputedCompetitionId);
  console.log('Championship players:', championshipPlayers.length);
  console.log('Validated games total:', validatedGames.length);
  console.log('Pending games total:', pendingGames.length);
  console.log('\nTest accounts (password: Test1234!):');
  for (const user of seedUsers) {
    console.log(`- ${user.email} (${user.uid}, role=${user.role})`);
  }
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
