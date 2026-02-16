export type GameStatus =
  | 'pending_validation'
  | 'validated'
  | 'disputed'
  | 'cancelled';

export type ProposalStatus =
  | 'pending_validation'
  | 'accepted'
  | 'rejected'
  | 'expired';

export interface Rules {
  startingPoints: number;
  returnPoints: number;
  uma: number[];
  oka: number;
  scoreSum: number;
  rounding: 'nearest_100' | 'none';
  allowOpenTanyao?: boolean;
  useRedFives?: boolean;
  redFivesCount?: {
    man: number;
    pin: number;
    sou: number;
  };
  useIppatsu?: boolean;
  useUraDora?: boolean;
  useKanDora?: boolean;
  useKanUraDora?: boolean;
  headBump?: boolean;
  agariYame?: boolean;
  tobiEnd?: boolean;
  honbaPoints?: number;
  notenPaymentTotal?: number;
  riichiBetPoints?: number;
}

export interface UserProfile {
  displayName: string;
  email: string;
  clubIds: string[];
  activeClubId?: string;
  fcmTokens?: string[];
}

export interface Competition {
  id: string;
  name: string;
  type: 'tournament' | 'championship';
  status: 'draft' | 'active' | 'archived';
  startAt?: string;
  endAt?: string;
  rules?: {
    mode: 'inherit' | 'override';
    overrideRules?: Rules;
  };
  tournamentConfig?: {
    participantUserIds: string[];
    totalRounds: number;
    pairingAlgorithm?: 'performance_swiss' | 'precomputed_min_repeats';
  };
  tournamentState?: {
    activeRoundNumber: number | null;
    lastCompletedRound: number;
  };
}

export interface LeaderboardEntry {
  userId: string;
  totalPoints: number;
  gamesPlayed: number;
  updatedAt?: string;
}
