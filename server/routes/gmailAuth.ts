import { Router } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { authenticateToken } from '../middleware/auth';
import { oauthRateLimiter } from '../middleware/rateLimiters';
import * as gmailAuthController from '../controllers/gmailAuthController';
import * as emailTemplateController from '../controllers/emailTemplateController';

const router = Router();

/**
 * GET /api/auth/gmail/url
 * Returns the Gmail OAuth authorization URL (protected)
 * Rate limited: 20 failed requests per 15 minutes per IP
 */
router.get('/gmail/url', oauthRateLimiter, authenticateToken, asyncWrapper(gmailAuthController.getGmailAuthUrlHandler));

/**
 * GET /api/auth/gmail/status
 * Check if the current user has connected their Gmail (protected)
 * Rate limited: 20 failed requests per 15 minutes per IP
 */
router.get('/gmail/status', oauthRateLimiter, authenticateToken, asyncWrapper(gmailAuthController.getGmailStatusHandler));

/**
 * POST /api/auth/gmail/disconnect
 * Disconnect the user's Gmail account (protected)
 * Rate limited: 20 failed requests per 15 minutes per IP
 */
router.post('/gmail/disconnect', oauthRateLimiter, authenticateToken, asyncWrapper(gmailAuthController.disconnectGmailHandler));

/**
 * POST /api/auth/email/templates/update
 * Update an email template (protected)
 * Rate limited: 20 failed requests per 15 minutes per IP
 */
router.post('/email/templates/update', oauthRateLimiter, authenticateToken, asyncWrapper(emailTemplateController.updateEmailTemplateHandler));

export default router;
