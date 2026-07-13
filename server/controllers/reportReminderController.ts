import { asyncWrapper } from '../utils/asyncWrapper';
import { checkAndSendReportReminders, initializeReportReminderScheduler } from '../services/reportReminderScheduler';
import { logger } from '../utils/logger';

/**
 * Controller for report reminder operations
 */

/**
 * Trigger report reminder check manually
 * This endpoint can be called by a cron job or manually for testing
 */
export const triggerReportReminders = asyncWrapper(async (req, res) => {
  try {
    logger.info('Manual trigger of report reminders requested');
    await checkAndSendReportReminders();
    res.json({ 
      success: true, 
      message: 'Report reminder check completed' 
    });
  } catch (error) {
    logger.error('Error in triggerReportReminders controller:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to trigger report reminders' 
    });
  }
});

/**
 * Initialize the report reminder scheduler
 * This should be called on server startup
 */
export const initializeReportReminders = asyncWrapper(async (req, res) => {
  try {
    await initializeReportReminderScheduler();
    res.json({ 
      success: true, 
      message: 'Report reminder scheduler initialized' 
    });
  } catch (error) {
    logger.error('Error in initializeReportReminders controller:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to initialize report reminder scheduler' 
    });
  }
});
