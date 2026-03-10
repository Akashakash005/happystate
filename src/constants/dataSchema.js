export const DB_SCHEMA = {
  users: 'users',
  characters: {
    public: 'publicCharacter',
    private: 'privateCharacter',
  },
  appData: 'appData',
  memory: 'memory',
  docs: {
    profile: 'profile',
    moodEntries: 'moodEntries',
    journalSessions: 'journalSessions',
    longTermSummary: 'longTermSummary',
    rollingContext: 'rollingContext',
  },
};

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function getUserDocId({ email, uid } = {}) {
  const normalizedEmail = normalizeEmail(email);
  return normalizedEmail || String(uid || '').trim();
}

export function normalizeCharacterMode(mode) {
  return mode === 'private' ? 'private' : 'public';
}

export function getCharacterCollection(mode = 'public') {
  return DB_SCHEMA.characters[normalizeCharacterMode(mode)];
}

export function getCharacterDocSegments(userDocId, mode = 'public') {
  return [DB_SCHEMA.users, userDocId, getCharacterCollection(mode)];
}

export function getCharacterDocPath(userDocId, mode = 'public', branch = DB_SCHEMA.appData, docId = '') {
  const parts = [...getCharacterDocSegments(userDocId, mode), branch];
  if (docId) parts.push(docId);
  return parts.join('/');
}

export function getUserPaths(user, mode = 'public') {
  const userDocId = getUserDocId(user);
  const characterRoot = `${DB_SCHEMA.users}/${userDocId}/${getCharacterCollection(mode)}`;
  return {
    user: `${DB_SCHEMA.users}/${userDocId}`,
    character: characterRoot,
    appData: `${characterRoot}/${DB_SCHEMA.appData}`,
    memory: `${characterRoot}/${DB_SCHEMA.memory}`,
  };
}
