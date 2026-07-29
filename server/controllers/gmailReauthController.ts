import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/auth';
import { firestoreAdmin } from '../services/firebaseAdmin';
import { logger } from '../utils/logger';

/**
 * GET /api/gmail-reauth-required
 * Admin-only endpoint to fetch Gmail accounts needing re-authentication
 */
export async function getGmailReauthRequiredHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const snapshot = await firestoreAdmin.collection('gmail_reauth_required')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    const reauthRequired = snapshot.docs.map(doc => doc.data());

    res.json({
      success: true,
      reauthRequired,
      count: reauthRequired.length
    });
  } catch (error) {
    logger.error('Error fetching Gmail reauth required:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Gmail reauth required'
    });
  }
}
