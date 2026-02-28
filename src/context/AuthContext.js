import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth/react-native';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { DB_SCHEMA, getUserDocId, normalizeEmail } from '../constants/dataSchema';

const AuthContext = createContext(null);

function isEmailExistsError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toUpperCase();
  return code.includes('email-already-in-use') || message.includes('EMAIL_EXISTS');
}

function sanitizeDisplayName(value, email = '') {
  const next = String(value || '').trim();
  const emailLower = String(email || '').trim().toLowerCase();
  if (!next) return '';
  if (next.toLowerCase() === emailLower) return '';
  if (next.includes('@')) return '';
  return next;
}

async function upsertProfile(firebaseUser, extraFields = {}) {
  const shouldSetProfileCompleted = Object.prototype.hasOwnProperty.call(
    extraFields,
    'profileCompleted'
  );
  const shouldSetOnboardingRequired = Object.prototype.hasOwnProperty.call(
    extraFields,
    'onboardingRequired'
  );

  const userDocId = getUserDocId(firebaseUser);
  const ref = doc(db, DB_SCHEMA.users, userDocId);
  await setDoc(
    ref,
    {
      uid: firebaseUser.uid,
      email: normalizeEmail(firebaseUser.email),
      displayName: sanitizeDisplayName(
        extraFields.displayName || firebaseUser.displayName || '',
        firebaseUser.email
      ),
      ...(shouldSetProfileCompleted ? { profileCompleted: Boolean(extraFields.profileCompleted) } : {}),
      ...(shouldSetOnboardingRequired ? { onboardingRequired: Boolean(extraFields.onboardingRequired) } : {}),
      updatedAt: serverTimestamp(),
      ...extraFields,
    },
    { merge: true }
  );
}

async function ensureUserDataScaffold(firebaseUser) {
  const userDocId = getUserDocId(firebaseUser);
  const profileRef = doc(
    db,
    DB_SCHEMA.users,
    userDocId,
    DB_SCHEMA.appData,
    DB_SCHEMA.docs.profile
  );
  const moodEntriesRef = doc(
    db,
    DB_SCHEMA.users,
    userDocId,
    DB_SCHEMA.appData,
    DB_SCHEMA.docs.moodEntries
  );
  const journalSessionsRef = doc(
    db,
    DB_SCHEMA.users,
    userDocId,
    DB_SCHEMA.appData,
    DB_SCHEMA.docs.journalSessions
  );
  const longTermSummaryRef = doc(
    db,
    DB_SCHEMA.users,
    userDocId,
    DB_SCHEMA.memory,
    DB_SCHEMA.docs.longTermSummary
  );
  const rollingContextRef = doc(
    db,
    DB_SCHEMA.users,
    userDocId,
    DB_SCHEMA.memory,
    DB_SCHEMA.docs.rollingContext
  );

  const [profileSnap, moodSnap, journalSnap, longTermSnap, rollingSnap] = await Promise.all([
    getDoc(profileRef),
    getDoc(moodEntriesRef),
    getDoc(journalSessionsRef),
    getDoc(longTermSummaryRef),
    getDoc(rollingContextRef),
  ]);

  const tasks = [];

  if (!profileSnap.exists()) {
    tasks.push(
      setDoc(
        profileRef,
        {
          name: sanitizeDisplayName(firebaseUser.displayName, firebaseUser.email),
          email: normalizeEmail(firebaseUser.email),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  if (!moodSnap.exists()) {
    tasks.push(
      setDoc(
        moodEntriesRef,
        {
          entries: [],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  if (!journalSnap.exists()) {
    tasks.push(
      setDoc(
        journalSessionsRef,
        {
          sessions: [],
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  if (!longTermSnap.exists()) {
    tasks.push(
      setDoc(
        longTermSummaryRef,
        {
          profileSummary: '',
          emotionalBaselineSummary: '',
          personalityPattern: '',
          stressBaseline: '',
          emotionalTriggers: [],
          supportPatterns: [],
          recurringThemes: [],
          relationshipPatterns: [],
          manualTags: [],
          userOverrides: {
            profileSummary: false,
            emotionalBaselineSummary: false,
            personalityPattern: false,
            stressBaseline: false,
            emotionalTriggers: false,
            supportPatterns: false,
            recurringThemes: false,
            relationshipPatterns: false,
            manualTags: false,
          },
          lastCompressedAt: null,
          lastProcessedJournalEntryCount: 0,
          lastProcessedMoodEntryCount: 0,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  if (!rollingSnap.exists()) {
    tasks.push(
      setDoc(
        rollingContextRef,
        {
          recentMoodTrend7d: '',
          recentEntriesSummary: '',
          sessionSummary: '',
          activeFocus: '',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    );
  }

  if (tasks.length) {
    await Promise.all(tasks);
  }
}

async function migrateLegacyUidStructure(firebaseUser) {
  const userDocId = getUserDocId(firebaseUser);
  const legacyUid = firebaseUser.uid;
  if (!userDocId || userDocId === legacyUid) return;

  const legacyRootRef = doc(db, DB_SCHEMA.users, legacyUid);
  const nextRootRef = doc(db, DB_SCHEMA.users, userDocId);
  const legacyRootSnap = await getDoc(legacyRootRef);
  const nextRootSnap = await getDoc(nextRootRef);

  if (legacyRootSnap.exists() && !nextRootSnap.exists()) {
    await setDoc(nextRootRef, { ...legacyRootSnap.data() }, { merge: true });
  }

  const appDocIds = [
    DB_SCHEMA.docs.profile,
    DB_SCHEMA.docs.moodEntries,
    DB_SCHEMA.docs.journalSessions,
  ];

  for (const docId of appDocIds) {
    const legacyAppRef = doc(db, DB_SCHEMA.users, legacyUid, DB_SCHEMA.appData, docId);
    const nextAppRef = doc(db, DB_SCHEMA.users, userDocId, DB_SCHEMA.appData, docId);
    const [legacySnap, nextSnap] = await Promise.all([getDoc(legacyAppRef), getDoc(nextAppRef)]);
    if (!legacySnap.exists()) continue;

    const legacyData = legacySnap.data() || {};
    if (!nextSnap.exists()) {
      await setDoc(nextAppRef, { ...legacyData }, { merge: true });
      continue;
    }

    const nextData = nextSnap.data() || {};
    const shouldRecoverMoodEntries =
      docId === DB_SCHEMA.docs.moodEntries &&
      Array.isArray(legacyData.entries) &&
      legacyData.entries.length > 0 &&
      (!Array.isArray(nextData.entries) || nextData.entries.length === 0);
    const shouldRecoverJournalSessions =
      docId === DB_SCHEMA.docs.journalSessions &&
      Array.isArray(legacyData.sessions) &&
      legacyData.sessions.length > 0 &&
      (!Array.isArray(nextData.sessions) || nextData.sessions.length === 0);

    if (shouldRecoverMoodEntries || shouldRecoverJournalSessions) {
      await setDoc(nextAppRef, { ...legacyData }, { merge: true });
    }
  }

  const memoryDocIds = [DB_SCHEMA.docs.longTermSummary, DB_SCHEMA.docs.rollingContext];
  for (const docId of memoryDocIds) {
    const legacyMemRef = doc(db, DB_SCHEMA.users, legacyUid, DB_SCHEMA.memory, docId);
    const nextMemRef = doc(db, DB_SCHEMA.users, userDocId, DB_SCHEMA.memory, docId);
    const [legacySnap, nextSnap] = await Promise.all([getDoc(legacyMemRef), getDoc(nextMemRef)]);
    if (legacySnap.exists() && !nextSnap.exists()) {
      await setDoc(nextMemRef, { ...legacySnap.data() }, { merge: true });
    }
  }
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
          await migrateLegacyUidStructure(firebaseUser);
          await upsertProfile(firebaseUser, { lastLoginAt: serverTimestamp() });
          await ensureUserDataScaffold(firebaseUser);
          const userDocId = getUserDocId(firebaseUser);
          const snap = await getDoc(doc(db, DB_SCHEMA.users, userDocId));
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
        onboardingRequired: true,
      });
      await ensureUserDataScaffold(cred.user);
    } catch (error) {
      if (isEmailExistsError(error)) {
        try {
          const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
          await upsertProfile(cred.user, {
            displayName: (displayName || '').trim() || cred.user.displayName || '',
            profileCompleted: false,
            onboardingRequired: true,
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
      const userDocId = getUserDocId(currentUser);
      await deleteUser(currentUser);
      try {
        if (userDocId) {
          await deleteDoc(doc(db, DB_SCHEMA.users, userDocId));
        }
        if (uid && userDocId !== uid) {
          await deleteDoc(doc(db, DB_SCHEMA.users, uid));
        }
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
        const currentUser = auth.currentUser;
        const userDocId = getUserDocId(currentUser);
        if (!userDocId) return null;
        const snap = await getDoc(doc(db, DB_SCHEMA.users, userDocId));
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

