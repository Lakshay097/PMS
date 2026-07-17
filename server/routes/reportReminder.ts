import { Router } from 'express';
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

export default router;
