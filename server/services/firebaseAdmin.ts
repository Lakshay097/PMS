import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { logger } from '../utils/logger';

let _firestoreAdmin: Firestore | null = null;

function getFirestoreAdmin(): Firestore {
  if (_firestoreAdmin) {
    return _firestoreAdmin;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!projectId) {
    const msg =
      `Missing required Firebase Admin environment variable: FIREBASE_PROJECT_ID. ` +
      `This must be set in your .env file or Cloud Run secrets configuration.`;
    logger.error(msg);
    throw new Error(msg);
  }

  // Use Application Default Credentials (ADC) for authentication
  // This allows Cloud Run to authenticate using its service account
  // with cross-project access granted via IAM roles
  if (!getApps().length) {
    initializeApp({
      projectId: projectId,
      // No explicit credential - will use ADC automatically
    });
  }

  _firestoreAdmin = getFirestore();
  return _firestoreAdmin;
}

// Proxy that initialises lazily on first property access so that a missing
// env var is a runtime error on the call-site rather than a fatal startup
// crash that takes down the entire server.
export const firestoreAdmin = new Proxy({} as Firestore, {
  get(_target, prop) {
    const db = getFirestoreAdmin();
    const value = (db as any)[prop];
    return typeof value === 'function' ? value.bind(db) : value;
  },
});
