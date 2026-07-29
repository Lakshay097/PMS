import 'dotenv/config';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

console.log('Testing Firebase credentials...');
console.log('Project ID:', process.env.FIREBASE_PROJECT_ID);
console.log('Client Email:', process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
console.log('Private Key present:', !!process.env.FIREBASE_ADMIN_PRIVATE_KEY);

try {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    }),
  });

  console.log('Firebase app initialized successfully');

  getFirestore().collection('users').limit(1).get()
    .then(s => {
      console.log('✓ SUCCESS: Firestore connection works');
      console.log('  Docs returned:', s.size);
      process.exit(0);
    })
    .catch(e => {
      console.error('✗ FAILED: Firestore query failed');
      console.error('  Error:', e.message);
      console.error('  Code:', e.code);
      process.exit(1);
    });
} catch (e) {
  console.error('✗ FAILED: Firebase initialization failed');
  console.error('  Error:', e.message);
  process.exit(1);
}
