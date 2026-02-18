'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { ensureTestAdminAccess } from '@/lib/callables';
import { auth, db } from '@/lib/firebaseClient';

const TEST_ADMIN_EMAIL = 'admin@mahjong.local';

async function ensureUserDoc(user: { uid: string; email: string | null; displayName: string | null }) {
  const userRef = doc(db, 'users', user.uid);
  const existing = await getDoc(userRef);
  if (existing.exists()) {
    return;
  }

  await setDoc(userRef, {
    displayName: user.displayName ?? user.email ?? user.uid,
    email: user.email,
    clubIds: [],
    activeClubId: null,
    fcmTokens: [],
    createdAt: serverTimestamp()
  });
}

async function ensureTestAdminIfNeeded(user: { email: string | null }) {
  const normalizedEmail = user.email?.trim().toLowerCase();
  const shouldRun = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true';

  if (!shouldRun || normalizedEmail !== TEST_ADMIN_EMAIL) {
    return;
  }

  await ensureTestAdminAccess();
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await ensureUserDoc(result.user);
      await ensureTestAdminIfNeeded(result.user);
      router.push('/club');
    } catch (signInError) {
      setError((signInError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onSignUp = async () => {
    setError(null);
    setLoading(true);

    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await ensureUserDoc(result.user);
      await ensureTestAdminIfNeeded(result.user);
      router.push('/club');
    } catch (signUpError) {
      setError((signUpError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setError(null);
    setLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await ensureUserDoc(result.user);
      await ensureTestAdminIfNeeded(result.user);
      router.push('/club');
    } catch (googleError) {
      setError((googleError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">Sign in</h2>
      <form className="mt-4 space-y-3" onSubmit={onSignIn}>
        <input
          className="w-full rounded border border-slate-300 p-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          className="w-full rounded border border-slate-300 p-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button
          className="w-full rounded bg-brand-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-70"
          type="submit"
          disabled={loading}
        >
          Sign in
        </button>
      </form>
      <div className="mt-3 flex gap-2">
        <button
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          onClick={onSignUp}
          disabled={loading}
        >
          Create account
        </button>
        <button
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          onClick={onGoogle}
          disabled={loading}
        >
          Google
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
