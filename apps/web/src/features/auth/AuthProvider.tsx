'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

import { auth, db } from '@/lib/firebaseClient';
import type { UserProfile } from '@/domain/models';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  activeClubRole: 'admin' | 'member' | null;
  activeClubRoleLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  activeClubRole: null,
  activeClubRoleLoading: true
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileResolved, setProfileResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeClubRole, setActiveClubRole] = useState<'admin' | 'member' | null>(null);
  const [activeClubRoleLoading, setActiveClubRoleLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setProfileResolved(!nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileResolved(true);
      return;
    }

    setProfileResolved(false);
    const ref = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      if (!snapshot.exists()) {
        setProfile(null);
        setProfileResolved(true);
        return;
      }

      setProfile(snapshot.data() as UserProfile);
      setProfileResolved(true);
    });

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) {
      setActiveClubRole(null);
      setActiveClubRoleLoading(false);
      return;
    }

    if (!profileResolved) {
      setActiveClubRole(null);
      setActiveClubRoleLoading(true);
      return;
    }

    if (!profile?.activeClubId) {
      setActiveClubRole(null);
      setActiveClubRoleLoading(false);
      return;
    }

    setActiveClubRoleLoading(true);
    const membershipRef = doc(db, `clubs/${profile.activeClubId}/members/${user.uid}`);
    const unsubscribe = onSnapshot(
      membershipRef,
      (snapshot) => {
        const role = snapshot.data()?.role;
        setActiveClubRole(role === 'admin' ? 'admin' : snapshot.exists() ? 'member' : null);
        setActiveClubRoleLoading(false);
      },
      () => {
        setActiveClubRole(null);
        setActiveClubRoleLoading(false);
      }
    );

    return unsubscribe;
  }, [profile?.activeClubId, profileResolved, user]);

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      activeClubRole,
      activeClubRoleLoading
    }),
    [activeClubRole, activeClubRoleLoading, user, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  return useContext(AuthContext);
}
