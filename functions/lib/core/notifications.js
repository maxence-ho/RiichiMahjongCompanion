"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendValidationNotifications = sendValidationNotifications;
async function sendValidationNotifications({ db, messaging, userIds, proposalId, gameId, type }) {
    const userSnapshots = await Promise.all(userIds.map((userId) => db.doc(`users/${userId}`).get()));
    const tokens = new Set();
    for (const snapshot of userSnapshots) {
        const tokenList = snapshot.data()?.fcmTokens ?? [];
        for (const token of tokenList) {
            tokens.add(token);
        }
    }
    if (tokens.size === 0) {
        return;
    }
    await messaging.sendEachForMulticast({
        tokens: [...tokens],
        notification: {
            title: 'Validation required',
            body: type === 'game_create' ? 'A new game requires your approval.' : 'A game edit requires your approval.'
        },
        data: {
            proposalId,
            gameId,
            type,
            deeplink: `/games/${gameId}`
        }
    });
}
