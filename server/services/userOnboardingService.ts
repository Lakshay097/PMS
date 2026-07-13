import { firestoreAdmin } from './firebaseAdmin';
import { logger } from '../utils/logger';

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
    return doc.data() as UserOnboardingStatus;
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
 * Get all users who haven't received their first report email yet
 */
export async function getUsersWithoutFirstEmail(emails: string[]): Promise<string[]> {
  try {
    const result: string[] = [];
    for (const email of emails) {
      const hasReceived = await hasReceivedFirstReportEmail(email);
      if (!hasReceived) {
        result.push(email);
      }
    }
    return result;
  } catch (err) {
    logger.error('Error getting users without first email:', err);
    return [];
  }
}
