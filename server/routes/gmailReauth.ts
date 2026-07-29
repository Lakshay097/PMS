import { Router } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import * as gmailReauthController from '../controllers/gmailReauthController';

const router = Router();

/**
 * GET /api/gmail-reauth-required
 * Admin-only endpoint to fetch Gmail accounts needing re-authentication
 */
router.get('/', authenticateToken, requireAdmin, asyncWrapper(gmailReauthController.getGmailReauthRequiredHandler));

export default router;
