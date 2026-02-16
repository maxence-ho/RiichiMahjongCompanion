export type GameStatus = 'pending_validation' | 'validated' | 'disputed' | 'cancelled';

export type ProposalType = 'create' | 'edit';
export type ProposalStatus = 'pending_validation' | 'accepted' | 'rejected' | 'expired';

export interface Rules {
  startingPoints: number;
  returnPoints: number;
  uma: [number, number, number, number];
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

export interface ComputedResult {
  ranks: Record<string, number>;
  totalPoints: Record<string, number>;
}

export interface VersionCore {
  participants: string[];
  finalScores: Record<string, number>;
  competitionIds: string[];
}

export interface VersionRecord extends VersionCore {
  gameId: string;
  clubId: string;
  versionNumber: number;
  rulesSnapshot: Rules;
  computed: ComputedResult;
  createdBy: string;
  createdAt: unknown;
}
