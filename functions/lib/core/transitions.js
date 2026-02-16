"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canTransitionGameStatus = canTransitionGameStatus;
const validTransitions = {
    pending_validation: ['validated', 'disputed', 'cancelled'],
    validated: ['pending_validation', 'cancelled'],
    disputed: ['pending_validation', 'cancelled'],
    cancelled: []
};
function canTransitionGameStatus(from, to) {
    return validTransitions[from].includes(to);
}
