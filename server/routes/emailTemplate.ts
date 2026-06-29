import { Router } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { authenticateToken } from '../middleware/auth';
import * as emailTemplateController from '../controllers/emailTemplateController';

const router = Router();

/**
 * GET /api/email/templates
 * Get all email templates
 */
router.get('/email/templates', authenticateToken, asyncWrapper(emailTemplateController.getEmailTemplatesHandler));

/**
 * POST /api/email/templates
 * Save an email template
 */
router.post('/email/templates', authenticateToken, asyncWrapper(emailTemplateController.saveEmailTemplateHandler));

/**
 * POST /api/email/templates/update
 * Update an email template body (for Admin Panel)
 */
router.post('/email/templates/update', authenticateToken, asyncWrapper(emailTemplateController.updateEmailTemplateHandler));

/**
 * POST /api/email/templates/reset
 * Reset a template to its default value
 */
router.post('/email/templates/reset', authenticateToken, asyncWrapper(emailTemplateController.resetEmailTemplateHandler));

export default router;
