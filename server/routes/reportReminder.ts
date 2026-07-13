import { Router } from 'express';
import { triggerReportReminders, initializeReportReminders } from '../controllers/reportReminderController';
import { getTeamReportConfigs, updateTeamReportConfig } from '../controllers/teamReportConfigController';

const router = Router();

/**
 * GET /api/report-reminders/config
 * Get all team report configurations
 */
router.get('/config', getTeamReportConfigs);

/**
 * PUT /api/report-reminders/config/:teamId
 * Update a team's report configuration
 */
router.put('/config/:teamId', updateTeamReportConfig);

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
