import type { GameStatus } from '../types.js';

const validTransitions: Record<GameStatus, GameStatus[]> = {
  pending_validation: ['validated', 'disputed', 'cancelled'],
  validated: ['pending_validation', 'cancelled'],
  disputed: ['pending_validation', 'cancelled'],
  cancelled: []
};

export function canTransitionGameStatus(from: GameStatus, to: GameStatus) {
  return validTransitions[from].includes(to);
}
