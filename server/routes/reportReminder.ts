import { Router } from 'express';
import { triggerReportReminders, initializeReportReminders } from '../controllers/reportReminderController';

const router = Router();

/**
 * POST /api/report-reminders/trigger
 * Manually trigger report reminder check
 */
router.post('/trigger', triggerReportReminders);

/**
 * POST /api/report-reminders/initialize
 * Initialize the report reminder scheduler
 */
router.post('/initialize', initializeReportReminders);

export default router;
