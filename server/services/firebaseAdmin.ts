import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { logger } from '../utils/logger';

let _firestoreAdmin: Firestore | null = null;

function getFirestoreAdmin(): Firestore {
  if (_firestoreAdmin) {
    return _firestoreAdmin;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  // Use explicit credentials when available (local development)
  // Fall back to ADC when credentials are not present (Cloud Run)
  if (!getApps().length) {
    if (projectId && clientEmail && privateKey) {
      logger.info('Using explicit Firebase Admin credentials');
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
      });
    } else if (projectId) {
      logger.info('Using Application Default Credentials (ADC) for Firebase');
      initializeApp({
        projectId: projectId,
      });
    } else {
      const msg = 'Missing required Firebase Admin environment variable: FIREBASE_PROJECT_ID';
      logger.error(msg);
      throw new Error(msg);
    }
  }

  _firestoreAdmin = getFirestore();
  // Use REST API instead of gRPC to avoid connection hanging issues
  // This is especially important for local development and certain network environments
  _firestoreAdmin.settings({ preferRest: true });
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
