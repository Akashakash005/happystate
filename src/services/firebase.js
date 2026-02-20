import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCvxwg_ILKr76CXNf7HUH8pApnBtBUtmkg',
  authDomain: 'moodtracker-5af95.firebaseapp.com',
  projectId: 'moodtracker-5af95',
  storageBucket: 'moodtracker-5af95.firebasestorage.app',
  messagingSenderId: '563692983468',
  appId: '1:563692983468:web:8810a4f68a58be7fa07b09',
  measurementId: 'G-PYGBNGEPS7',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
