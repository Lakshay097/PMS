import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

console.log('Project ID:', projectId);
console.log('Client email:', clientEmail ? clientEmail.substring(0, 30) + '...' : 'NOT SET');
console.log('Private key present:', !!privateKey);

if (!getApps().length) {
  try {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    console.log('Firebase initialized with explicit credentials');
  } catch (err) {
    console.error('Init error:', err.message);
    process.exit(1);
  }
}

const db = getFirestore();
db.settings({ preferRest: true });

console.log('Querying tasks collection (with 15s timeout)...');
try {
  const snap = await Promise.race([
    db.collection('tasks').limit(1).get(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT after 15s')), 15000))
  ]);
  console.log('SUCCESS! Doc count:', snap.size);
} catch (err) {
  console.error('FAILED:', err.message);
  console.error('Full error:', err);
}
process.exit(0);
