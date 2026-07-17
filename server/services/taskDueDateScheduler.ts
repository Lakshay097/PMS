import { generateGoogleSheetsToken, fetchSheetValues } from './googleSheetsService';
import { triggerTaskDueSoonEmail, triggerTaskOverdueEmail } from './emailTriggerService';
import { firestoreAdmin } from './firebaseAdmin';
import { enqueueSheetsWrite } from './sheetsSyncController';
import { logger } from '../utils/logger';

// Intra-process lock to prevent overlapping runs within the same process
let isRunning = false;

const SETTINGS_COLLECTION = 'settings';

// Set TASK_SCHEDULER_DRY_RUN=true to exercise the full read path (Firestore
// lock state, task scan, who-would-get-emailed) with ZERO side effects:
// no lock is claimed, no settings are written, no emails are sent, nothing
// is enqueued to Sheets. Safe to run against production data as many times
// as needed before deploying.
const DRY_RUN = process.env.TASK_SCHEDULER_DRY_RUN === 'true';

/**
 * Reads a single setting value from Firestore. Firestore is the authoritative
 * source (sheetsSyncController flushes Firestore -> Sheets every 5 minutes,
 * overwriting Sheets), so reading from Sheets here would race with that flush.
 */
async function getSettingValue(key: string, defaultValue: string): Promise<string> {
  try {
    const doc = await firestoreAdmin.collection(SETTINGS_COLLECTION).doc(key).get();
    if (!doc.exists) return defaultValue;
    const value = doc.data()?.Value;
    return value !== undefined && value !== null ? String(value) : defaultValue;
  } catch (err) {
    logger.error(`TaskDueDateScheduler: Error reading setting ${key} from Firestore, using default`, err);
    return defaultValue;
  }
}

/**
 * Writes a setting to Firestore (authoritative, matches emailTriggerService.ts's
 * { Key, Value } doc shape) and enqueues the identical write for Google Sheets
 * via the established sync queue, instead of writing to Sheets directly.
 * A direct Sheets write would just get silently overwritten by the next
 * 5-minute Firestore -> Sheets flush in sheetsSyncController.ts.
 */
async function saveSettingValue(key: string, value: string): Promise<boolean> {
  try {
    await firestoreAdmin.collection(SETTINGS_COLLECTION).doc(key).set(
      { Key: key, Value: value },
      { merge: true }
    );
    await enqueueSheetsWrite('settings', 'save', { Key: key, Value: value });
    return true;
  } catch (err) {
    logger.error(`TaskDueDateScheduler: Failed to save setting ${key}`, err);
    return false;
  }
}

async function saveSettingValueWithRetry(
  key: string,
  value: string,
  maxRetries: number = 3
): Promise<boolean> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const success = await saveSettingValue(key, value);
      if (success) {
        return true;
      }
    } catch (err: any) {
      lastError = err;

      if (err?.status === 429 || err?.message?.includes('429')) {
        const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        logger.warn(`TaskDueDateScheduler: Rate limit hit saving ${key}, backing off ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      break;
    }
  }

  if (lastError) {
    logger.error(`TaskDueDateScheduler: Failed to save setting ${key} after ${maxRetries} attempts`, lastError);
  }
  return false;
}

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
 * Checks all active tasks and sends due-soon/overdue email notifications.
 *
 * Dedup strategy: a Firestore-backed daily lock (settings collection,
 * keys last_due_date_check_date / _status / _timestamp) ensures this only
 * fully completes once per calendar day. Every subsequent trigger that day -
 * the hourly timer, or a fresh container after a redeploy calling the
 * startup check - reads the lock first and no-ops if already done today.
 * A 30-minute staleness check prevents a crash mid-run from wedging it.
 * This mirrors the pattern already proven in recurringTaskScheduler.ts.
 */
export async function checkAndSendDueDateReminders(): Promise<void> {
  // 1. Check intra-process lock (same-process overlapping ticks)
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

    // 2. Check cross-process / cross-redeploy daily lock via Firestore
    const lastDate = await getSettingValue('last_due_date_check_date', '');
    const lastStatus = await getSettingValue('last_due_date_check_status', '');
    const lastTimestamp = await getSettingValue('last_due_date_check_timestamp', '');

    let isStaleRunning = false;
    if (lastStatus === 'running' && lastTimestamp) {
      try {
        const startTime = new Date(lastTimestamp).getTime();
        const elapsedMs = Date.now() - startTime;
        if (elapsedMs > 30 * 60 * 1000) {
          isStaleRunning = true;
          logger.warn(`TaskDueDateScheduler: Detected stale run (elapsed=${elapsedMs}ms)`);
        }
      } catch (e) {
        logger.error('TaskDueDateScheduler: Error parsing timestamp', e);
      }
    }

    const alreadyRanToday = lastDate === todayStr && lastStatus === 'success';
    const isRunningRecently = lastDate === todayStr && lastStatus === 'running' && !isStaleRunning;

    if (alreadyRanToday && !DRY_RUN) {
      logger.info('TaskDueDateScheduler: Already completed run successfully today, skipping.');
      isRunning = false;
      return;
    }
    if (isRunningRecently && !DRY_RUN) {
      logger.info('TaskDueDateScheduler: Run skipped because another instance is currently running.');
      isRunning = false;
      return;
    }
    if ((alreadyRanToday || isRunningRecently) && DRY_RUN) {
      logger.info(`TaskDueDateScheduler: [DRY RUN] Real run would SKIP here (alreadyRanToday=${alreadyRanToday}, isRunningRecently=${isRunningRecently}). Continuing anyway to show what would be evaluated.`);
    }

    logger.info(`TaskDueDateScheduler: ${DRY_RUN ? '[DRY RUN] ' : ''}Checking due date reminders. today=${todayStr}, tomorrow=${tomorrowStr}`);
    logger.info(`TaskDueDateScheduler: [lock state] lastDate=${lastDate || '(none)'} lastStatus=${lastStatus || '(none)'} isStaleRunning=${isStaleRunning} -> would ${alreadyRanToday ? 'SKIP (already ran today)' : isRunningRecently ? 'SKIP (running elsewhere)' : 'PROCEED'}`);

    if (DRY_RUN) {
      logger.info('TaskDueDateScheduler: [DRY RUN] Not claiming lock, not writing settings.');
    } else {
      // Claim the lock immediately (cross-process lock, authoritative in Firestore)
      await saveSettingValueWithRetry('last_due_date_check_date', todayStr);
      await saveSettingValueWithRetry('last_due_date_check_status', 'running');
      await saveSettingValueWithRetry('last_due_date_check_timestamp', new Date().toISOString());
    }

    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('TaskDueDateScheduler: Failed to obtain Google Sheets access token');
      if (!DRY_RUN) {
        await saveSettingValueWithRetry('last_due_date_check_status', 'error');
      }
      isRunning = false;
      return;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const accessToken = tokenData.accessToken;

    // Fetch all tasks
    const tasksRows = await fetchSheetValues(accessToken, spreadsheetId, 'tasks!A:Z');
    if (!tasksRows || tasksRows.length <= 1) {
      logger.warn('TaskDueDateScheduler: No tasks available');
      if (!DRY_RUN) {
        await saveSettingValueWithRetry('last_due_date_check_status', 'success');
      }
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

        if (DRY_RUN) {
          logger.info(`TaskDueDateScheduler: [DRY RUN] Would send OVERDUE email for task ${taskId} ("${title}") to assignedTo=${assignedToEmail}, assignedBy=${assignedByEmail}`);
          overdueCount++;
          continue;
        }

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

        if (DRY_RUN) {
          logger.info(`TaskDueDateScheduler: [DRY RUN] Would send DUE-SOON email for task ${taskId} ("${title}") to assignedTo=${assignedToEmail}, assignedBy=${assignedByEmail}`);
          dueSoonCount++;
          continue;
        }

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

    logger.info(`TaskDueDateScheduler: ${DRY_RUN ? '[DRY RUN] ' : ''}Execution complete. dueSoon=${dueSoonCount}, overdue=${overdueCount}`);
    if (!DRY_RUN) {
      await saveSettingValueWithRetry('last_due_date_check_status', 'success');
    } else {
      logger.info('TaskDueDateScheduler: [DRY RUN] Not writing final status. No emails were sent, no settings were changed.');
    }
  } catch (err) {
    logger.error('TaskDueDateScheduler: Critical error in due date reminder scheduler:', err);
    if (!DRY_RUN) {
      await saveSettingValueWithRetry('last_due_date_check_status', 'error');
    }
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

  // Execute once immediately on startup. Safe now: the Firestore daily lock
  // makes this a no-op if today's run already succeeded, even across redeploys.
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