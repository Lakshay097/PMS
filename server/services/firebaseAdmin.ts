import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  // Validate all required environment variables are present
  const missing: string[] = [];
  if (!projectId) missing.push('FIREBASE_PROJECT_ID');
  if (!clientEmail) missing.push('FIREBASE_ADMIN_CLIENT_EMAIL');
  if (!privateKey) missing.push('FIREBASE_ADMIN_PRIVATE_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Missing required Firebase Admin environment variables: ${missing.join(', ')}. ` +
      `These must be set in your .env file or Cloud Run secrets configuration.`
    );
  }

  // Un-escape literal \n sequences back into real newlines
  const formattedPrivateKey = privateKey!.replace(/\\n/g, '\n');

  initializeApp({
    credential: cert({
      projectId: projectId!,
      clientEmail: clientEmail!,
      privateKey: formattedPrivateKey,
    }),
  });
}

export const firestoreAdmin = getFirestore();
