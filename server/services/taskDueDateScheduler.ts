import { generateGoogleSheetsToken, fetchSheetValues } from './googleSheetsService';
import { triggerTaskDueSoonEmail, triggerTaskOverdueEmail } from './emailTriggerService';
import { logger } from '../utils/logger';

// Intra-process lock to prevent overlapping runs within the same process
let isRunning = false;

// Timezone-aware date helper
function getLocalDateInfo(): { dateStr: string } {
  const tz = process.env.TZ || 'Asia/Kolkata';
  try {
    const options = {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    } as const;
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(new Date());
    const result: Record<string, string> = {};
    parts.forEach(p => { result[p.type] = p.value; });
    
    return {
      dateStr: `${result.year}-${result.month}-${result.day}`,
    };
  } catch (err) {
    logger.error(`TaskDueDateScheduler: Error determining date in timezone ${tz}, falling back to UTC`, err);
    const now = new Date();
    return {
      dateStr: now.toISOString().split('T')[0],
    };
  }
}

/**
 * Checks all active tasks and sends due-soon/overdue email notifications
 */
export async function checkAndSendDueDateReminders(): Promise<void> {
  // 1. Check intra-process lock
  if (isRunning) {
    logger.warn('TaskDueDateScheduler: Execution skipped. A scheduler run is already in progress in this instance.');
    return;
  }

  isRunning = true;

  try {
    const timeInfo = getLocalDateInfo();
    const todayStr = timeInfo.dateStr;
    const today = new Date(todayStr);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    logger.info(`TaskDueDateScheduler: Checking due date reminders. today=${todayStr}, tomorrow=${tomorrowStr}`);

    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('TaskDueDateScheduler: Failed to obtain Google Sheets access token');
      isRunning = false;
      return;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const accessToken = tokenData.accessToken;

    // Fetch all tasks
    const tasksRows = await fetchSheetValues(accessToken, spreadsheetId, 'tasks!A:Z');
    if (!tasksRows || tasksRows.length <= 1) {
      logger.warn('TaskDueDateScheduler: No tasks available');
      isRunning = false;
      return;
    }

    // Fetch users for email resolution
    const usersRows = await fetchSheetValues(accessToken, spreadsheetId, 'users!A:Z');
    const usersMap = new Map<string, { email: string; fullName: string }>();
    if (usersRows && usersRows.length > 1) {
      for (let i = 1; i < usersRows.length; i++) {
        const row = usersRows[i];
        const email = row[2]?.trim().toLowerCase();
        const fullName = row[1]?.trim();
        if (email && fullName) {
          usersMap.set(email, { email, fullName });
        }
      }
    }

    // Parse tasks (skip header row at index 0)
    // Schema: TaskID, Title, Description, Priority, StartDate, DueDate, AssignedByEmail, AssignedToEmail, Status, ...
    let dueSoonCount = 0;
    let overdueCount = 0;

    for (let i = 1; i < tasksRows.length; i++) {
      const row = tasksRows[i];
      const taskId = row[0];
      const title = row[1];
      const description = row[2];
      const priority = row[3];
      const dueDate = row[5];
      const assignedByEmail = row[6];
      const assignedToEmail = row[7];
      const status = row[8];

      // Skip if task is closed or inactive
      if (!taskId || !dueDate || status === 'Closed') {
        continue;
      }

      // Check if task is overdue (due date < today)
      if (dueDate < todayStr) {
        logger.info(`TaskDueDateScheduler: Task ${taskId} is overdue. Due: ${dueDate}`);
        
        try {
          await triggerTaskOverdueEmail(
            assignedByEmail,
            assignedToEmail,
            {
              TaskID: taskId,
              Title: title,
              Description: description,
              DueDate: dueDate,
              Priority: priority,
            }
          );
          overdueCount++;
        } catch (err) {
          logger.error(`TaskDueDateScheduler: Failed to send overdue email for task ${taskId}`, err);
        }
      }
      // Check if task is due soon (due date == tomorrow)
      else if (dueDate === tomorrowStr) {
        logger.info(`TaskDueDateScheduler: Task ${taskId} is due soon. Due: ${dueDate}`);
        
        try {
          await triggerTaskDueSoonEmail(
            assignedByEmail,
            assignedToEmail,
            {
              TaskID: taskId,
              Title: title,
              Description: description,
              DueDate: dueDate,
              Priority: priority,
            }
          );
          dueSoonCount++;
        } catch (err) {
          logger.error(`TaskDueDateScheduler: Failed to send due-soon email for task ${taskId}`, err);
        }
      }
    }

    logger.info(`TaskDueDateScheduler: Execution complete. dueSoon=${dueSoonCount}, overdue=${overdueCount}`);
  } catch (err) {
    logger.error('TaskDueDateScheduler: Critical error in due date reminder scheduler:', err);
  } finally {
    isRunning = false;
  }
}

let schedulerIntervalId: NodeJS.Timeout | null = null;

/**
 * Starts the hourly checks for due date reminders
 */
export function startTaskDueDateScheduler(): void {
  if (schedulerIntervalId) {
    return;
  }

  logger.info('TaskDueDateScheduler: Initializing hourly due date reminder check...');

  // Execute once immediately on startup (will run if needed)
  checkAndSendDueDateReminders().catch(err => {
    logger.error('TaskDueDateScheduler: Startup check failed', err);
  });

  // Check every hour
  schedulerIntervalId = setInterval(() => {
    checkAndSendDueDateReminders().catch(err => {
      logger.error('TaskDueDateScheduler: Interval execution failed', err);
    });
  }, 60 * 60 * 1000);
}
