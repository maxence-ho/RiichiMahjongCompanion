import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getToken } from 'firebase/messaging';

import { db, getMessagingIfSupported } from '@/lib/firebaseClient';

export async function registerPushToken(userId: string): Promise<string | null> {
  const hasMessagingConfig =
    Boolean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID) &&
    Boolean(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID);

  if (!hasMessagingConfig) {
    return null;
  }

  const messaging = await getMessagingIfSupported();
  if (!messaging) {
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return null;
  }

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  try {
    const token = await getToken(messaging, { vapidKey });
    if (!token) {
      return null;
    }

    await updateDoc(doc(db, 'users', userId), {
      fcmTokens: arrayUnion(token)
    });

    return token;
  } catch {
    return null;
  }
}
