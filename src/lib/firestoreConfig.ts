// Client-side Firestore is disabled because this app uses JWT authentication
// (not Firebase Authentication). Firestore security rules require Firebase Auth.
// All database operations go through the backend API which uses Firebase Admin SDK.
export const db = null;
