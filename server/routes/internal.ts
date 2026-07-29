import { Router } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { authenticateOidc } from '../middleware/oidcAuth';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import * as internalSchedulerController from '../controllers/internalSchedulerController';

const router = Router();

/**
 * POST /api/internal/run-weekly-reminders
 * Internal endpoint for Cloud Scheduler to trigger weekly report reminders
 * Requires OIDC authentication (Cloud Scheduler service account)
 */
router.post('/run-weekly-reminders', asyncWrapper(authenticateOidc), asyncWrapper(internalSchedulerController.runWeeklyReminders));

/**
 * POST /api/internal/manual-trigger-report-reminders
 * Admin-only endpoint to manually trigger report reminders for testing
 * Requires Admin authentication (JWT)
 */
router.post('/manual-trigger-report-reminders', authenticateToken, requireAdmin, asyncWrapper(internalSchedulerController.manualTriggerReportReminders));

export default router;
