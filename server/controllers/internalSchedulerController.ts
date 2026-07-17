import { Response } from 'express';
import { OidcRequest } from '../middleware/oidcAuth';
import { logger } from '../utils/logger';
import { checkAndSendReportReminders } from '../services/reportReminderScheduler';

/**
 * POST /api/internal/run-weekly-reminders
 * Internal endpoint triggered by Cloud Scheduler via OIDC authentication
 * 
 * This endpoint:
 * - Requires OIDC authentication (Cloud Scheduler service account)
 * - Responds immediately with 202 Accepted to avoid Cloud Scheduler timeout
 * - Runs checkAndSendReportReminders() asynchronously in the background
 * - Logs all actions and errors without crashing the process
 */
export const runWeeklyReminders = async (req: OidcRequest, res: Response): Promise<void> => {
  try {
    const oidcEmail = req.oidc?.email || 'unknown';
    logger.info(`[CLOUD SCHEDULER] Weekly reminders triggered by ${oidcEmail}`);

    // Respond immediately with 202 Accepted to avoid Cloud Scheduler timeout
    // The actual work will continue in the background
    res.status(202).json({
      message: 'Weekly reminder job accepted and running in background',
      triggeredBy: oidcEmail,
      timestamp: new Date().toISOString()
    });

    // Run the reminder function asynchronously after responding
    // This prevents Cloud Scheduler from timing out on long-running jobs
    setImmediate(async () => {
      try {
        logger.info('[CLOUD SCHEDULER] Starting checkAndSendReportReminders()');
        await checkAndSendReportReminders();
        logger.info('[CLOUD SCHEDULER] checkAndSendReportReminders() completed successfully');
      } catch (error) {
        logger.error('[CLOUD SCHEDULER] checkAndSendReportReminders() failed:', error);
        // Don't crash the process - just log the error
      }
    });

  } catch (error) {
    logger.error('[CLOUD SCHEDULER] Failed to accept weekly reminder job:', error);
    // Only send error response if we haven't already sent 202
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to accept weekly reminder job',
        timestamp: new Date().toISOString()
      });
    }
  }
};
