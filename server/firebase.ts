import { firestoreAdmin } from './services/firebaseAdmin';

/**
 * Firebase Admin SDK database instance.
 * This bypasses Firestore security rules, allowing the backend to perform
 * authorized reads/writes on behalf of authenticated users.
 */
export const db = firestoreAdmin;
