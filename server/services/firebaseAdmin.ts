import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { logger } from '../utils/logger';

let _firestoreAdmin: Firestore | null = null;

function getFirestoreAdmin(): Firestore {
  if (_firestoreAdmin) {
    return _firestoreAdmin;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  const missing: string[] = [];
  if (!projectId) missing.push('FIREBASE_ADMIN_PROJECT_ID or FIREBASE_PROJECT_ID');
  if (!clientEmail) missing.push('FIREBASE_ADMIN_CLIENT_EMAIL');
  if (!privateKey) missing.push('FIREBASE_ADMIN_PRIVATE_KEY');

  if (missing.length > 0) {
    const msg =
      `Missing required Firebase Admin environment variables: ${missing.join(', ')}. ` +
      `These must be set in your .env file or Cloud Run secrets configuration.`;
    logger.error(msg);
    throw new Error(msg);
  }

  // Un-escape literal \n sequences back into real newlines (needed when value
  // comes from a .env file; Cloud Secret Manager delivers real newlines already,
  // so the replace is a no-op in that case).
  const formattedPrivateKey = privateKey!.replace(/\\n/g, '\n');

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: projectId!,
        clientEmail: clientEmail!,
        privateKey: formattedPrivateKey,
      }),
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
