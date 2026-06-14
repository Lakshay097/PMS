import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

import importedConfig from '../../firebase-applet-config.json';

// Standard fallback configuration for local design preview and offline development
const defaultConfig = {
  apiKey: "placeholder-api-key",
  authDomain: "placeholder-auth.firebaseapp.com",
  projectId: "placeholder-project",
  storageBucket: "placeholder-project.appspot.com",
  messagingSenderId: "12345678",
  appId: "1:12345678:web:12345678",
  firestoreDatabaseId: "(default)"
};

const firebaseConfig = { ...defaultConfig, ...importedConfig };

// Ensure unique initialization to prevent "app already exists" error
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const dbId = firebaseConfig.firestoreDatabaseId;
export const db = (dbId && dbId !== "(default)") ? getFirestore(app, dbId) : getFirestore(app);
export const auth = getAuth(app);
