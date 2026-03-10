const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const [, , serviceAccountArg] = process.argv;

if (!serviceAccountArg) {
  console.error(
    "Usage: node scripts/migrateLegacyCharacterData.js <path-to-serviceAccountKey.json>",
  );
  process.exit(1);
}

const serviceAccountPath = path.resolve(serviceAccountArg);
if (!fs.existsSync(serviceAccountPath)) {
  console.error(`Service account file not found: ${serviceAccountPath}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function migrateUserDoc(userDoc) {
  const userId = userDoc.id;
  let changed = 0;

  const rootAppData = db.collection("users").doc(userId).collection("appData");
  const publicAppData = db
    .collection("users")
    .doc(userId)
    .collection("publicCharacter")
    .doc("appData");

  const rootMemory = db.collection("users").doc(userId).collection("memory");
  const publicMemory = db
    .collection("users")
    .doc(userId)
    .collection("publicCharacter")
    .doc("memory");

  const appDocIds = ["profile", "moodEntries", "journalSessions"];
  for (const docId of appDocIds) {
    const sourceSnap = await rootAppData.doc(docId).get();
    if (!sourceSnap.exists) continue;
    const targetSnap = await publicAppData.get();
    const fieldKey =
      docId === "profile"
        ? "profile"
        : docId === "moodEntries"
          ? "moodEntries"
          : "journalSessions";
    if (!targetSnap.exists || !targetSnap.data()?.[fieldKey]) {
      await publicAppData.set({ [fieldKey]: sourceSnap.data() }, { merge: true });
      changed += 1;
    }
  }

  const memoryDocIds = ["longTermSummary", "rollingContext"];
  for (const docId of memoryDocIds) {
    const sourceSnap = await rootMemory.doc(docId).get();
    if (!sourceSnap.exists) continue;
    const targetSnap = await publicMemory.get();
    const fieldKey =
      docId === "longTermSummary" ? "longTermSummary" : "rollingContext";
    if (!targetSnap.exists || !targetSnap.data()?.[fieldKey]) {
      await publicMemory.set({ [fieldKey]: sourceSnap.data() }, { merge: true });
      changed += 1;
    }
  }

  return changed;
}

async function main() {
  const userDocs = await db.collection("users").get();
  let changedUsers = 0;
  let changedDocs = 0;

  for (const userDoc of userDocs.docs) {
    const changed = await migrateUserDoc(userDoc);
    if (changed > 0) {
      changedUsers += 1;
      changedDocs += changed;
      console.log(`Migrated ${changed} legacy docs for ${userDoc.id}`);
    }
  }

  console.log(
    `Done. Updated ${changedDocs} docs across ${changedUsers} user records.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
