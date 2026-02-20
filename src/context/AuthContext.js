import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

const AuthContext = createContext(null);

async function upsertProfile(firebaseUser, extraFields = {}) {
  const ref = doc(db, 'users', firebaseUser.uid);
  await setDoc(
    ref,
    {
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      displayName: extraFields.displayName || firebaseUser.displayName || '',
      updatedAt: serverTimestamp(),
      ...extraFields,
    },
    { merge: true }
  );
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
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          setProfile(snap.exists() ? snap.data() : null);
        } else {
          setProfile(null);
        }
      } catch {
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
      });
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
    try {
      await signOut(auth);
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
