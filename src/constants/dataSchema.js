export const DB_SCHEMA = {
  users: 'users',
  appData: 'appData',
  docs: {
    profile: 'profile',
    moodEntries: 'moodEntries',
    journalSessions: 'journalSessions',
  },
};

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function getUserDocId({ email, uid } = {}) {
  const normalizedEmail = normalizeEmail(email);
  return normalizedEmail || String(uid || '').trim();
}

export function getUserPaths(user) {
  const userDocId = getUserDocId(user);
  return {
    user: `${DB_SCHEMA.users}/${userDocId}`,
    profile: `${DB_SCHEMA.users}/${userDocId}/${DB_SCHEMA.appData}/${DB_SCHEMA.docs.profile}`,
    moodEntries: `${DB_SCHEMA.users}/${userDocId}/${DB_SCHEMA.appData}/${DB_SCHEMA.docs.moodEntries}`,
    journalSessions: `${DB_SCHEMA.users}/${userDocId}/${DB_SCHEMA.appData}/${DB_SCHEMA.docs.journalSessions}`,
  };
}
