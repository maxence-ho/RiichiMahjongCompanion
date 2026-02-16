import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import {
  adminUpsertClubMemberSchema,
  parseOrThrow,
  requireAuthUid
} from '../core/validators.js';

export async function adminUpsertClubMemberHandler(data: unknown, uid?: string | null) {
  const input = parseOrThrow(adminUpsertClubMemberSchema, data);
  const authUid = requireAuthUid(uid);
  const db = getFirestore();

  const [adminMemberSnapshot, targetUserSnapshot] = await Promise.all([
    db.doc(`clubs/${input.clubId}/members/${authUid}`).get(),
    db.doc(`users/${input.targetUserId}`).get()
  ]);

  if (!adminMemberSnapshot.exists || adminMemberSnapshot.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admin can manage club members.');
  }

  if (!targetUserSnapshot.exists) {
    throw new HttpsError('not-found', 'Target user not found.');
  }

  const targetUserData = targetUserSnapshot.data() as any;

  const batch = db.batch();
  batch.set(
    db.doc(`clubs/${input.clubId}/members/${input.targetUserId}`),
    {
      role: input.role,
      joinedAt: FieldValue.serverTimestamp(),
      displayNameCache:
        targetUserData.displayName ?? targetUserData.email ?? targetUserData.uid ?? input.targetUserId
    },
    { merge: true }
  );

  batch.set(
    db.doc(`users/${input.targetUserId}`),
    {
      clubIds: FieldValue.arrayUnion(input.clubId),
      activeClubId: targetUserData.activeClubId ?? input.clubId
    },
    { merge: true }
  );

  await batch.commit();

  return {
    ok: true,
    userId: input.targetUserId,
    role: input.role
  };
}
