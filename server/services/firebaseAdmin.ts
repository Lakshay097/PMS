import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { logger } from '../utils/logger';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

let _firestoreAdmin: Firestore | null = null;

function getFirestoreAdmin(): Firestore {
  if (_firestoreAdmin) {
    return _firestoreAdmin;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Cloud Run secrets may be stored with literal \n text OR real newlines,
  // or with multiple layers of escaping (e.g. \\n, \\\\n). Loop-replace until
  // no escaped newlines remain, matching the same logic used for GOOGLE_PRIVATE_KEY
  // in env.ts.
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '';
  let privateKey = rawKey;
  while (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  // Use explicit credentials when available (local development)
  // Fall back to ADC when credentials are not present (Cloud Run)
  if (!getApps().length) {
    if (projectId && clientEmail && privateKey) {
      logger.info('Using explicit Firebase Admin credentials');
      try {
        initializeApp({
          credential: cert({ projectId, clientEmail, privateKey }),
        });
      } catch (err) {
        logger.error('Failed to initialize Firebase Admin with explicit credentials:', err);
        // Try using service account file as fallback
        try {
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = dirname(__filename);
          const serviceAccountPath = join(__dirname, '../../pms-taskflow-aa254-firebase-adminsdk-fbsvc-96bbc9a0e2.json');
          const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
          logger.info('Using service account file as fallback');
          initializeApp({
            credential: cert(serviceAccount),
          });
        } catch (fileErr) {
          logger.error('Failed to use service account file:', fileErr);
          // Fall back to ADC
          logger.info('Falling back to Application Default Credentials (ADC)');
          initializeApp({
            projectId: projectId,
          });
        }
      }
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
