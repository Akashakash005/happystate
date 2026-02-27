import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { DB_SCHEMA } from '../constants/dataSchema';

const AuthContext = createContext(null);

function isEmailExistsError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toUpperCase();
  return code.includes('email-already-in-use') || message.includes('EMAIL_EXISTS');
}

async function upsertProfile(firebaseUser, extraFields = {}) {
  const ref = doc(db, DB_SCHEMA.users, firebaseUser.uid);
  await setDoc(
    ref,
    {
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      displayName: extraFields.displayName || firebaseUser.displayName || '',
      profileCompleted: false,
      updatedAt: serverTimestamp(),
      ...extraFields,
    },
    { merge: true }
  );
}

async function ensureUserDataScaffold(firebaseUser) {
  const uid = firebaseUser.uid;
  const profileRef = doc(
    db,
    DB_SCHEMA.users,
    uid,
    DB_SCHEMA.appData,
    DB_SCHEMA.docs.profile
  );
  const moodEntriesRef = doc(
    db,
    DB_SCHEMA.users,
    uid,
    DB_SCHEMA.appData,
    DB_SCHEMA.docs.moodEntries
  );
  const journalSessionsRef = doc(
    db,
    DB_SCHEMA.users,
    uid,
    DB_SCHEMA.appData,
    DB_SCHEMA.docs.journalSessions
  );

  await Promise.all([
    setDoc(
      profileRef,
      {
        name: firebaseUser.displayName || '',
        email: firebaseUser.email || '',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ),
    setDoc(
      moodEntriesRef,
      {
        entries: [],
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ),
    setDoc(
      journalSessionsRef,
      {
        sessions: [],
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ),
  ]);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        setUser(firebaseUser || null);

        if (firebaseUser) {
          await upsertProfile(firebaseUser, { lastLoginAt: serverTimestamp() });
          await ensureUserDataScaffold(firebaseUser);
          const snap = await getDoc(doc(db, DB_SCHEMA.users, firebaseUser.uid));
          setProfile(snap.exists() ? snap.data() : null);
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.warn('Auth profile bootstrap failed:', error?.message || error);
        setProfile(null);
      } finally {
        setInitializing(false);
      }
    });

    return unsubscribe;
  }, []);

  const signup = async ({ email, password, displayName }) => {
    setAuthLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await upsertProfile(cred.user, {
        displayName: (displayName || '').trim(),
        createdAt: serverTimestamp(),
        profileCompleted: false,
      });
      await ensureUserDataScaffold(cred.user);
    } catch (error) {
      if (isEmailExistsError(error)) {
        try {
          const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
          await upsertProfile(cred.user, {
            displayName: (displayName || '').trim() || cred.user.displayName || '',
            profileCompleted: false,
            updatedAt: serverTimestamp(),
          });
          await ensureUserDataScaffold(cred.user);
          return;
        } catch (loginError) {
          throw loginError;
        }
      }
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const login = async ({ email, password }) => {
    setAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    setAuthLoading(true);
    // Optimistic local logout so UI reliably exits authenticated flow.
    setUser(null);
    setProfile(null);
    setInitializing(false);
    try {
      await signOut(auth);
    } catch {
      // Keep local logout state even if remote sign-out fails intermittently.
    } finally {
      setAuthLoading(false);
    }
  };

  const deleteAccount = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No authenticated user found.');
    }

    setAuthLoading(true);
    try {
      const uid = currentUser.uid;
      await deleteUser(currentUser);
      try {
        await deleteDoc(doc(db, DB_SCHEMA.users, uid));
      } catch {
        // Best-effort cleanup. Account deletion succeeded even if profile doc cleanup fails.
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const value = useMemo(
    () => ({
      user,
      profile,
      initializing,
      authLoading,
      signup,
      login,
      logout,
      deleteAccount,
      refreshProfile: async () => {
        const uid = auth.currentUser?.uid;
        if (!uid) return null;
        const snap = await getDoc(doc(db, DB_SCHEMA.users, uid));
        const next = snap.exists() ? snap.data() : null;
        setProfile(next);
        return next;
      },
    }),
    [user, profile, initializing, authLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

