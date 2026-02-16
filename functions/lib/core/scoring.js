"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeGameOutcome = computeGameOutcome;
function applyScoreRounding(score, rounding) {
    if (rounding === 'nearest_100') {
        return Math.round(score / 100) * 100;
    }
    return score;
}
function roundPointValue(value) {
    return Math.round(value * 10) / 10;
}
function computeGameOutcome(participants, finalScores, rules) {
    const normalizedScores = participants.map((userId) => ({
        userId,
        score: applyScoreRounding(finalScores[userId], rules.rounding)
    }));
    normalizedScores.sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId));
    const ranks = {};
    const totalPoints = {};
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
            const total = raw + averageUma + topShare;
            ranks[entry.userId] = groupStartPosition;
            totalPoints[entry.userId] = roundPointValue(total);
        }
        cursor += groupSize;
    }
    return {
        ranks,
        totalPoints
    };
}
