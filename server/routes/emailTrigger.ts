import { Router } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { authenticateToken } from '../middleware/auth';
import { oauthRateLimiter } from '../middleware/rateLimiters';
import * as emailTriggerController from '../controllers/emailTriggerController';

const router = Router();

/**
 * POST /api/email/trigger/task-assignment
 * Triggers task assignment email (protected)
 * Rate limited: 20 failed requests per 15 minutes per IP
 */
router.post('/email/trigger/task-assignment', oauthRateLimiter, authenticateToken, asyncWrapper(emailTriggerController.triggerTaskAssignmentHandler));

/**
 * POST /api/email/trigger/task-due-soon
 * Triggers task due soon email (protected)
 * Rate limited: 20 failed requests per 15 minutes per IP
 */
router.post('/email/trigger/task-due-soon', oauthRateLimiter, authenticateToken, asyncWrapper(emailTriggerController.triggerTaskDueSoonHandler));

/**
 * POST /api/email/trigger/task-overdue
 * Triggers task overdue email (protected)
 * Rate limited: 20 failed requests per 15 minutes per IP
 */
router.post('/email/trigger/task-overdue', oauthRateLimiter, authenticateToken, asyncWrapper(emailTriggerController.triggerTaskOverdueHandler));

/**
 * POST /api/email/trigger/report-submission
 * Triggers report submission email (protected)
 * Rate limited: 20 failed requests per 15 minutes per IP
 */
router.post('/email/trigger/report-submission', oauthRateLimiter, authenticateToken, asyncWrapper(emailTriggerController.triggerReportSubmissionHandler));

export default router;
