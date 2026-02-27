export const DB_SCHEMA = {
  users: 'users',
  appData: 'appData',
  docs: {
    profile: 'profile',
    moodEntries: 'moodEntries',
    journalSessions: 'journalSessions',
  },
};

export function getUserPaths(uid) {
  return {
    user: `${DB_SCHEMA.users}/${uid}`,
    profile: `${DB_SCHEMA.users}/${uid}/${DB_SCHEMA.appData}/${DB_SCHEMA.docs.profile}`,
    moodEntries: `${DB_SCHEMA.users}/${uid}/${DB_SCHEMA.appData}/${DB_SCHEMA.docs.moodEntries}`,
    journalSessions: `${DB_SCHEMA.users}/${uid}/${DB_SCHEMA.appData}/${DB_SCHEMA.docs.journalSessions}`,
  };
}
