import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { Socket } from 'node:net';

function ensureEmulatorEnv() {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
}

function parseHostPort(hostValue: string): { host: string; port: number } {
  const [host, portText] = hostValue.split(':');
  const port = Number(portText);
  return {
    host: host || '127.0.0.1',
    port: Number.isFinite(port) ? port : 0
  };
}

async function isTcpReachable(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    if (!host || !port) {
      resolve(false);
      return;
    }

    const socket = new Socket();
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function assertEmulatorsAvailable() {
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST as string;
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST as string;

  const authEndpoint = parseHostPort(authHost);
  const firestoreEndpoint = parseHostPort(firestoreHost);

  const [authOk, firestoreOk] = await Promise.all([
    isTcpReachable(authEndpoint.host, authEndpoint.port),
    isTcpReachable(firestoreEndpoint.host, firestoreEndpoint.port)
  ]);

  const missing: string[] = [];
  if (!authOk) {
    missing.push(`Auth emulator (${authHost})`);
  }
  if (!firestoreOk) {
    missing.push(`Firestore emulator (${firestoreHost})`);
  }

  if (missing.length > 0) {
    throw new Error(
      [
        `Missing emulator(s): ${missing.join(', ')}.`,
        'Start emulators first with: npm run dev:functions:admin',
        'Or run one-shot seed with: npm run seed:local:admin:exec'
      ].join('\n')
    );
  }
}

async function clearAuthUsers() {
  const auth = getAuth();
  let pageToken: string | undefined;

  do {
    const page = await auth.listUsers(1000, pageToken);
    if (page.users.length > 0) {
      const userIds = page.users.map((user) => user.uid);
      const result = await auth.deleteUsers(userIds);
      if (result.failureCount > 0) {
        throw new Error(`Failed to delete ${result.failureCount} auth users during reset.`);
      }
    }

    pageToken = page.pageToken;
  } while (pageToken);
}

async function clearFirestore(projectId: string) {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST as string;
  const url = `http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`;
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to clear Firestore emulator (${response.status}): ${body}`);
  }
}

async function seed() {
  ensureEmulatorEnv();
  await assertEmulatorsAvailable();

  const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? 'demo-mahjong-club';
  const adminUid = process.env.LOCAL_ADMIN_UID ?? 'u_admin';
  const adminEmail = process.env.LOCAL_ADMIN_EMAIL ?? 'admin@mahjong.local';
  const adminPassword = process.env.LOCAL_ADMIN_PASSWORD ?? 'Test1234!';
  const adminDisplayName = process.env.LOCAL_ADMIN_DISPLAY_NAME ?? adminEmail;
  const clubId = process.env.LOCAL_ADMIN_CLUB_ID ?? 'club_local_default';
  const clubName = process.env.LOCAL_ADMIN_CLUB_NAME ?? 'Mahjong Club Local';

  if (!getApps().length) {
    initializeApp({ projectId });
  }

  const auth = getAuth();
  const db = getFirestore();

  await clearAuthUsers();
  await clearFirestore(projectId);

  await auth.createUser({
    uid: adminUid,
    email: adminEmail,
    password: adminPassword,
    displayName: adminDisplayName,
    emailVerified: true
  });

  const now = Timestamp.now();
  const defaultRules = {
    startingPoints: 25000,
    returnPoints: 30000,
    uma: [20, 10, -10, -20],
    oka: 0,
    scoreSum: 100000,
    rounding: 'nearest_100'
  };

  const batch = db.batch();

  batch.set(db.doc(`users/${adminUid}`), {
    displayName: adminDisplayName,
    email: adminEmail,
    clubIds: [clubId],
    activeClubId: clubId,
    fcmTokens: [],
    createdAt: now
  });

  batch.set(db.doc(`clubs/${clubId}`), {
    name: clubName,
    createdBy: adminUid,
    createdAt: now,
    defaultRules
  });

  batch.set(db.doc(`clubs/${clubId}/members/${adminUid}`), {
    role: 'admin',
    joinedAt: now,
    displayNameCache: adminDisplayName
  });

  await batch.commit();

  console.log('\nAdmin-only local seed completed.');
  console.log('Project ID:', projectId);
  console.log('Club ID:', clubId);
  console.log('Admin UID:', adminUid);
  console.log('Admin email:', adminEmail);
  console.log('Admin password:', adminPassword);
}

seed().catch((error) => {
  console.error('Admin-only seed failed:', error);
  process.exit(1);
});
