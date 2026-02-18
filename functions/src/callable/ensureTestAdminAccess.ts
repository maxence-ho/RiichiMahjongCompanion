import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import {
  ensureTestAdminAccessSchema,
  parseOrThrow,
  requireAuthUid
} from '../core/validators.js';

const TEST_ADMIN_EMAIL = 'admin@mahjong.local';
const DEFAULT_TEST_CLUB_ID = 'club_seed_main';
const DEFAULT_TEST_CLUB_NAME = 'Mahjong Club Seed';
const DEFAULT_RULES = {
  startingPoints: 25000,
  returnPoints: 30000,
  uma: [20, 10, -10, -20],
  oka: 0,
  scoreSum: 100000,
  rounding: 'nearest_100'
} as const;

function normalizeEmail(email?: string | null): string {
  return (email ?? '').trim().toLowerCase();
}

function pickClubId(candidate?: string | null): string {
  const normalized = (candidate ?? '').trim();
  if (!normalized) {
    throw new HttpsError('invalid-argument', 'Missing club id.');
  }

  return normalized;
}

export async function ensureTestAdminAccessHandler(data: unknown, uid?: string | null) {
  if (process.env.FUNCTIONS_EMULATOR !== 'true') {
    throw new HttpsError('permission-denied', 'This endpoint is only available on emulators.');
  }

  const input = parseOrThrow(ensureTestAdminAccessSchema, data ?? {});
  const authUid = requireAuthUid(uid);

  const authUser = await getAuth().getUser(authUid);
  if (normalizeEmail(authUser.email) !== TEST_ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'Only the test admin account can use this endpoint.');
  }

  const db = getFirestore();
  const userRef = db.doc(`users/${authUid}`);
  const userSnapshot = await userRef.get();
  const userData = (userSnapshot.data() as { activeClubId?: string; clubIds?: string[] } | undefined) ?? {};

  const clubId = pickClubId(
    input.clubId ?? userData.activeClubId ?? userData.clubIds?.[0] ?? process.env.LOCAL_ADMIN_CLUB_ID ?? DEFAULT_TEST_CLUB_ID
  );
  const clubRef = db.doc(`clubs/${clubId}`);
  const memberRef = db.doc(`clubs/${clubId}/members/${authUid}`);
  const displayName = authUser.displayName ?? authUser.email ?? authUid;

  const [clubSnapshot, memberSnapshot] = await Promise.all([clubRef.get(), memberRef.get()]);
  const batch = db.batch();

  if (!clubSnapshot.exists) {
    batch.set(clubRef, {
      name: process.env.LOCAL_ADMIN_CLUB_NAME ?? DEFAULT_TEST_CLUB_NAME,
      createdBy: authUid,
      createdAt: FieldValue.serverTimestamp(),
      defaultRules: DEFAULT_RULES
    });
  }

  if (!memberSnapshot.exists || memberSnapshot.data()?.role !== 'admin') {
    batch.set(
      memberRef,
      {
        role: 'admin',
        joinedAt: FieldValue.serverTimestamp(),
        displayNameCache: displayName
      },
      { merge: true }
    );
  }

  batch.set(
    userRef,
    {
      displayName,
      email: authUser.email ?? TEST_ADMIN_EMAIL,
      clubIds: FieldValue.arrayUnion(clubId),
      activeClubId: clubId
    },
    { merge: true }
  );

  await batch.commit();

  return {
    ok: true,
    clubId,
    role: 'admin'
  };
}
