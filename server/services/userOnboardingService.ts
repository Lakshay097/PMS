import { firestoreAdmin } from './firebaseAdmin';
import { logger } from '../utils/logger';
import { convertTimestampsToISO } from '../lib/firestoreUtils';

// Firestore hard limit for getAll() calls
const GETALL_CHUNK_SIZE = 500;

export interface UserOnboardingStatus {
  email: string;
  firstReportEmailSent: boolean;
  sentAt?: string;
  updatedAt: string;
}

const COLLECTION_NAME = 'user_onboarding_status';

/**
 * Get a user's onboarding status
 */
export async function getUserOnboardingStatus(email: string): Promise<UserOnboardingStatus | null> {
  try {
    const doc = await firestoreAdmin.collection(COLLECTION_NAME).doc(email.toLowerCase()).get();
    if (!doc.exists) return null;
    return convertTimestampsToISO(doc.data()) as UserOnboardingStatus;
  } catch (err) {
    logger.error('Error getting user onboarding status:', err);
    return null;
  }
}

/**
 * Mark that a user has received their first report email
 */
export async function markFirstReportEmailSent(email: string): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    await firestoreAdmin.collection(COLLECTION_NAME).doc(email.toLowerCase()).set({
      email: email.toLowerCase(),
      firstReportEmailSent: true,
      sentAt: now,
      updatedAt: now,
    }, { merge: true });
    logger.info(`Marked first report email sent for ${email}`);
    return true;
  } catch (err) {
    logger.error('Error marking first report email sent:', err);
    return false;
  }
}

/**
 * Check if a user has received their first report email
 */
export async function hasReceivedFirstReportEmail(email: string): Promise<boolean> {
  const status = await getUserOnboardingStatus(email);
  return status?.firstReportEmailSent || false;
}

/**
 * Get all users who haven't received their first report email yet.
 * Uses getAll() for a single batched Firestore round-trip instead of
 * one .get() per email (N+1 → 1 read, or ceil(N/500) for large lists).
 */
export async function getUsersWithoutFirstEmail(emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];

  try {
    const normalised = emails.map(e => e.toLowerCase());

    // Chunk into batches of ≤500 to respect Firestore's getAll() hard limit
    const result: string[] = [];

    for (let i = 0; i < normalised.length; i += GETALL_CHUNK_SIZE) {
      const chunk = normalised.slice(i, i + GETALL_CHUNK_SIZE);
      const refs = chunk.map(email =>
        firestoreAdmin.collection(COLLECTION_NAME).doc(email)
      );

      // getAll() returns DocumentSnapshot[] in the same order as refs
      const docs = await firestoreAdmin.getAll(...refs);

      for (let j = 0; j < docs.length; j++) {
        const doc = docs[j];
        const hasReceived = doc.exists && (convertTimestampsToISO(doc.data()) as UserOnboardingStatus)?.firstReportEmailSent === true;
        if (!hasReceived) {
          result.push(chunk[j]);
        }
      }
    }

    return result;
  } catch (err) {
    logger.error('Error getting users without first email:', err);
    return [];
  }
}
