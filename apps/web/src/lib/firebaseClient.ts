import { initializeApp, getApps, getApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { getMessaging, isSupported } from 'firebase/messaging';

const isDev = process.env.NODE_ENV !== 'production';
const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true' || isDev;

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-mahjong-club';
const apiKey =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyD-local-emulator-key-00000000000000000';
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;

const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId,
  appId
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  const message = [
    'Firebase client config is incomplete.',
    'Set apps/web/.env.local from apps/web/.env.example,',
    'or enable emulators with NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true.'
  ].join(' ');
  if (typeof window === 'undefined') {
    // Keep build/prerender working; runtime still fails fast in browser when misconfigured.
    console.warn(message);
  } else {
    throw new Error(message);
  }
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

if (useEmulators && typeof window !== 'undefined') {
  const emulatorFlag = '__mahjongFirebaseEmulatorsConnected__';
  const globalState = globalThis as typeof globalThis & Record<string, boolean | undefined>;
  if (globalState[emulatorFlag]) {
    // Already connected during a previous hot-reload cycle.
  } else {
    const authHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1';
    const authPort = Number(process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT || 9099);
    const firestoreHost = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
    const firestorePort = Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080);
    const functionsHost = process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_HOST || '127.0.0.1';
    const functionsPort = Number(process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT || 5001);

    connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, firestoreHost, firestorePort);
    connectFunctionsEmulator(functions, functionsHost, functionsPort);
    globalState[emulatorFlag] = true;
  }
}

export async function getMessagingIfSupported() {
  if (!firebaseConfig.appId || !firebaseConfig.messagingSenderId) {
    return null;
  }

  const supported = await isSupported();
  if (!supported) {
    return null;
  }

  return getMessaging(app);
}

export default app;
