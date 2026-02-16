"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminUpsertClubMemberHandler = adminUpsertClubMemberHandler;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const validators_js_1 = require("../core/validators.js");
async function adminUpsertClubMemberHandler(data, uid) {
    const input = (0, validators_js_1.parseOrThrow)(validators_js_1.adminUpsertClubMemberSchema, data);
    const authUid = (0, validators_js_1.requireAuthUid)(uid);
    const db = (0, firestore_1.getFirestore)();
    const [adminMemberSnapshot, targetUserSnapshot] = await Promise.all([
        db.doc(`clubs/${input.clubId}/members/${authUid}`).get(),
        db.doc(`users/${input.targetUserId}`).get()
    ]);
    if (!adminMemberSnapshot.exists || adminMemberSnapshot.data()?.role !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Only admin can manage club members.');
    }
    if (!targetUserSnapshot.exists) {
        throw new https_1.HttpsError('not-found', 'Target user not found.');
    }
    const targetUserData = targetUserSnapshot.data();
    const batch = db.batch();
    batch.set(db.doc(`clubs/${input.clubId}/members/${input.targetUserId}`), {
        role: input.role,
        joinedAt: firestore_1.FieldValue.serverTimestamp(),
        displayNameCache: targetUserData.displayName ?? targetUserData.email ?? targetUserData.uid ?? input.targetUserId
    }, { merge: true });
    batch.set(db.doc(`users/${input.targetUserId}`), {
        clubIds: firestore_1.FieldValue.arrayUnion(input.clubId),
        activeClubId: targetUserData.activeClubId ?? input.clubId
    }, { merge: true });
    await batch.commit();
    return {
        ok: true,
        userId: input.targetUserId,
        role: input.role
    };
}
