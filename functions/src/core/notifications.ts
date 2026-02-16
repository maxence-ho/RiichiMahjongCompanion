import type { firestore, messaging } from 'firebase-admin';

interface ValidationNotificationInput {
  db: firestore.Firestore;
  messaging: messaging.Messaging;
  userIds: string[];
  proposalId: string;
  gameId: string;
  type: 'game_create' | 'game_edit';
}

export async function sendValidationNotifications({
  db,
  messaging,
  userIds,
  proposalId,
  gameId,
  type
}: ValidationNotificationInput) {
  const userSnapshots = await Promise.all(userIds.map((userId) => db.doc(`users/${userId}`).get()));

  const tokens = new Set<string>();
  for (const snapshot of userSnapshots) {
    const tokenList = (snapshot.data()?.fcmTokens as string[] | undefined) ?? [];
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
