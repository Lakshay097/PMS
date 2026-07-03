import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const keyFileName = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'firebase-service-account.json';
const keyPath = path.join(process.cwd(), keyFileName);

if (!getApps().length) {
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Firebase service account key not found at ${keyPath}. Check FIREBASE_SERVICE_ACCOUNT_PATH in .env`);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  initializeApp({
    credential: cert(serviceAccount),
  });
}

export const firestoreAdmin = getFirestore();
