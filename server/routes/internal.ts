import { Router } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { authenticateOidc } from '../middleware/oidcAuth';
import * as internalSchedulerController from '../controllers/internalSchedulerController';

const router = Router();

/**
 * POST /api/internal/run-weekly-reminders
 * Internal endpoint for Cloud Scheduler to trigger weekly report reminders
 * Requires OIDC authentication (Cloud Scheduler service account)
 */
router.post('/run-weekly-reminders', asyncWrapper(authenticateOidc), asyncWrapper(internalSchedulerController.runWeeklyReminders));

export default router;
