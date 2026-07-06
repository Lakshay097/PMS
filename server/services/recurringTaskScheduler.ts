import { generateGoogleSheetsToken, fetchSheetValues, updateSheetValues, appendSheetValues } from './googleSheetsService';
import { sendEmailAsUser } from './emailService';
import { logger } from '../utils/logger';
import { config } from '../config';

// Intra-process lock to prevent overlapping runs within the same process
let isRunning = false;

// Helper to query and update settings in Google Sheets
function getSettingValue(rows: any[][] | null, key: string, defaultValue: string): string {
  if (!rows) return defaultValue;
  const row = rows.find(r => r[0] === key);
  return row && row[1] !== undefined && row[1] !== null ? String(row[1]) : defaultValue;
}

async function saveSettingValueWithRetry(
  accessToken: string,
  spreadsheetId: string,
  rows: any[][],
  key: string,
  value: string,
  maxRetries: number = 3
): Promise<boolean> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const success = await saveSettingValue(accessToken, spreadsheetId, rows, key, value);
      if (success) {
        return true;
      }
    } catch (err: any) {
      lastError = err;
      
      // Check if it's a rate limit error (HTTP 429)
      if (err?.status === 429 || err?.message?.includes('429')) {
        const backoffMs = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
        logger.warn(`RecurringTaskScheduler: Rate limit hit, backing off for ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      // For other errors, don't retry
      break;
    }
  }
  
  if (lastError) {
    logger.error(`RecurringTaskScheduler: Failed to save setting after ${maxRetries} attempts`, lastError);
  }
  return false;
}

async function saveSettingValue(
  accessToken: string,
  spreadsheetId: string,
  rows: any[][],
  key: string,
  value: string
): Promise<boolean> {
  const index = rows.findIndex(r => r[0] === key);
  let success = false;
  if (index >= 0) {
    const range = `settings!B${index + 1}`;
    success = await updateSheetValues(accessToken, spreadsheetId, range, [[value]]);
    if (success) {
      rows[index][1] = value;
    }
  } else {
    success = await appendSheetValues(accessToken, spreadsheetId, 'settings', [[key, value]]);
    if (success) {
      rows.push([key, value]);
    }
  }
  return success;
}

/**
 * Checks and generates recurring task instances from templates
 * This scheduler runs hourly to ensure no instances are missed
 */
export async function checkAndGenerateRecurringTaskInstances(): Promise<void> {
  // 1. Check intra-process lock
  if (isRunning) {
    logger.warn('RecurringTaskScheduler: Execution skipped. A scheduler run is already in progress in this instance.');
    return;
  }

  isRunning = true;

  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentHour = now.getHours();

    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('RecurringTaskScheduler: Failed to obtain Google Sheets access token');
      isRunning = false;
      return;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const accessToken = tokenData.accessToken;

    // Fetch settings to check last run status
    const settingsRows = await fetchSheetValues(accessToken, spreadsheetId, 'settings!A:B');
    if (!settingsRows) {
      logger.error('RecurringTaskScheduler: Failed to fetch settings sheet');
      isRunning = false;
      return;
    }

    // Retrieve last run dates and statuses
    const lastDate = getSettingValue(settingsRows, 'last_recurring_task_check_date', '');
    const lastStatus = getSettingValue(settingsRows, 'last_recurring_task_check_status', '');
    const lastTimestamp = getSettingValue(settingsRows, 'last_recurring_task_check_timestamp', '');
    const lastProgress = getSettingValue(settingsRows, 'last_recurring_task_check_progress', '0');

    // Check if status is running but stale (older than 30 minutes)
    // Use progress to detect if still actively processing
    let isStaleRunning = false;
    if (lastStatus === 'running' && lastTimestamp) {
      try {
        const startTime = new Date(lastTimestamp).getTime();
        const elapsedMs = Date.now() - startTime;
        const progress = parseInt(lastProgress, 10);
        
        // If progress is 0 and older than 30 minutes, it's stale
        // If progress > 0, extend timeout to 60 minutes (large batch processing)
        const timeoutMs = progress > 0 ? 60 * 60 * 1000 : 30 * 60 * 1000;
        
        if (elapsedMs > timeoutMs) {
          isStaleRunning = true;
          logger.warn(`RecurringTaskScheduler: Detected stale run (progress=${progress}, elapsed=${elapsedMs}ms)`);
        }
      } catch (e) {
        logger.error('RecurringTaskScheduler: Error parsing timestamp', e);
      }
    }

    const alreadyRanToday = lastDate === todayStr && lastStatus === 'success';
    const isRunningRecently = lastDate === todayStr && lastStatus === 'running' && !isStaleRunning;

    if (alreadyRanToday) {
      logger.info('RecurringTaskScheduler: Already completed run successfully today');
      isRunning = false;
      return;
    }
    if (isRunningRecently) {
      logger.info('RecurringTaskScheduler: Run skipped because another instance is currently running');
      isRunning = false;
      return;
    }

    logger.info(`RecurringTaskScheduler: Initiating recurring task generation check. date=${todayStr}`);

    // Update status to 'running' with current timestamp in Google Sheets immediately (cross-process lock)
    await saveSettingValueWithRetry(accessToken, spreadsheetId, settingsRows, 'last_recurring_task_check_date', todayStr);
    await saveSettingValueWithRetry(accessToken, spreadsheetId, settingsRows, 'last_recurring_task_check_status', 'running');
    await saveSettingValueWithRetry(accessToken, spreadsheetId, settingsRows, 'last_recurring_task_check_timestamp', new Date().toISOString());
    await saveSettingValueWithRetry(accessToken, spreadsheetId, settingsRows, 'last_recurring_task_check_progress', '0');

    // Fetch templates
    const templatesRows = await fetchSheetValues(accessToken, spreadsheetId, 'templates!A:O');
    if (!templatesRows || templatesRows.length <= 1) {
      logger.warn('RecurringTaskScheduler: No templates available');
      await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_recurring_task_check_status', 'success');
      isRunning = false;
      return;
    }

    // Fetch existing tasks to check for duplicates
    const tasksRows = await fetchSheetValues(accessToken, spreadsheetId, 'tasks!A:Z');
    const existingTasks = tasksRows && tasksRows.length > 1 
      ? tasksRows.slice(1).map(row => ({
          TaskID: row[0],
          TemplateID: row[1],
          CycleKey: row[6],
          // Add other fields as needed
        }))
      : [];

    // Parse templates (skip header row at index 0)
    const templates = templatesRows.slice(1).map(row => ({
      TemplateID: row[0],
      Title: row[1],
      Description: row[2],
      Priority: row[3],
      RecurrenceType: row[4],
      StartDate: row[5],
      NextGenerationDate: row[6],
      LastGeneratedDate: row[7],
      AssignedByEmail: row[8],
      AssignedToEmail: row[9],
      AssignedToRole: row[10],
      TeamID: row[11],
      Active: row[12] === 'true' || row[12] === true,
    }));

    let generatedCount = 0;
    let missedCyclesCount = 0;
    let hasErrors = false;
    const totalTemplates = templates.length;
    let processedTemplates = 0;

    // Import taskEngine functions dynamically to avoid circular dependencies
    // Since we're in server-side code, we'll need to implement the logic here
    // or call it via an API endpoint. For now, we'll implement the core logic.
    
    for (const template of templates) {
      processedTemplates++;
      
      // Update progress every 5 templates or at the end
      if (processedTemplates % 5 === 0 || processedTemplates === totalTemplates) {
        const progressPercent = Math.round((processedTemplates / totalTemplates) * 100);
        await saveSettingValueWithRetry(accessToken, spreadsheetId, settingsRows, 'last_recurring_task_check_progress', progressPercent.toString());
      }
      if (!template.Active) continue;

      // Check if this template should generate a new instance today
      const nextGenDate = template.NextGenerationDate;
      if (!nextGenDate || nextGenDate > todayStr) {
        continue; // Not time to generate yet
      }

      // Handle backlog: if nextGenDate is significantly in the past, we may have missed cycles
      // Generate instances for all missed cycles, but only one per cycle
      const missedCycles = calculateMissedCycles(template.RecurrenceType, nextGenDate, todayStr, template.StartDate);
      
      if (missedCycles.length > 0) {
        missedCyclesCount += missedCycles.length;
        logger.info(`RecurringTaskScheduler: Template ${template.TemplateID} has ${missedCycles.length} missed cycles to generate`);
      }

      // Generate for current cycle (today) and any missed cycles
      const cyclesToGenerate = missedCycles.length > 0 ? missedCycles : [todayStr];

      for (const cycleDate of cyclesToGenerate) {
        // Check if already generated for this cycle
        const cycleKey = generateCycleKey(template.RecurrenceType, cycleDate, template.StartDate);
        const alreadyGenerated = existingTasks.some(
          task => task.TemplateID === template.TemplateID && task.CycleKey === cycleKey
        );

        if (alreadyGenerated) {
          logger.info(`RecurringTaskScheduler: Template ${template.TemplateID} already generated for cycle ${cycleKey}`);
          continue;
        }

        // Generate the task instance
        try {
          const newTaskId = `TSK-REC-${Math.floor(Date.now() + Math.random() * 1000)}`;
          const dueDate = calculateDueDate(template.RecurrenceType, cycleDate, template.StartDate);
        
          const newTaskRow = [
            newTaskId,                    // TaskID (A)
            template.TemplateID,          // TemplateID (B)
            '',                           // ParentTaskID (C)
            `${template.Title} - [Cycle ${cycleKey}]`, // Title (D)
            template.Description,         // Description (E)
            template.Priority,            // Priority (F)
            'Recurring',                  // TaskType (G)
            template.RecurrenceType,      // RecurrenceType (H)
            cycleKey,                     // CycleKey (I)
            cycleDate,                    // StartDate (J)
            dueDate,                      // DueDate (K)
            template.AssignedByEmail,     // AssignedByEmail (L)
            template.AssignedToEmail,     // AssignedToEmail (M)
            template.AssignedToRole,      // AssignedToRole (N)
            template.TeamID,               // TeamID (O)
            'In Progress',                 // Status (P)
            '0',                          // PercentComplete (Q)
            '',                           // LastReportSummary (R)
            'No',                         // RequiresFollowUp (S)
            '0',                          // FollowUpCount (T)
            '',                           // CompletionDate (U)
            '',                           // CloseRemark (V)
            '',                           // ClosedInSubTeamIDs (W)
            '',                           // AttachmentLink (X)
            new Date().toISOString(),      // CreatedAt (Y)
            new Date().toISOString(),      // UpdatedAt (Z)
            'true',                       // Active (AA)
            '',                           // DeletedAt (AB)
          ];

        const appendSuccess = await appendSheetValues(accessToken, spreadsheetId, 'tasks', [newTaskRow]);
        
        if (appendSuccess) {
          generatedCount++;
          logger.info(`RecurringTaskScheduler: Generated task instance ${newTaskId} for template ${template.TemplateID}`);
          
          // Trigger assignment email for the newly generated task
          try {
            const recipients = template.AssignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);
            const appUrl = config.APP_URL || 'http://localhost:3000';
            const emailSubject = `[${newTaskId}] ${template.Title} - [Cycle ${cycleKey}]`;
            
            for (const recipient of recipients) {
              const emailSuccess = await sendEmailAsUser(
                template.AssignedByEmail,
                recipient,
                emailSubject,
                '',
                'template_assigned_email',
                {
                  TaskID: newTaskId,
                  Title: `${template.Title} - [Cycle ${cycleKey}]`,
                  Description: template.Description || '',
                  Priority: template.Priority,
                  DueDate: dueDate,
                  AssignedToEmail: recipient,
                  AssignedToName: recipient, // Could be enhanced with name lookup
                  AssignedByEmail: template.AssignedByEmail,
                  AssignedByName: template.AssignedByEmail, // Could be enhanced with name lookup
                }
              );
              
              if (emailSuccess) {
                logger.info(`RecurringTaskScheduler: Email sent to ${recipient} for task ${newTaskId}`);
              } else {
                logger.warn(`RecurringTaskScheduler: Failed to send email to ${recipient} for task ${newTaskId}`);
              }
            }
          } catch (emailErr) {
            logger.error(`RecurringTaskScheduler: Error sending email for task ${newTaskId}`, emailErr);
            // Don't mark as error - task was still generated successfully
          }
          
          // Update template's generation dates
          const nextGen = calculateNextGenerationDate(template.RecurrenceType, todayStr);
          const templateRowIndex = templatesRows.findIndex(row => row[0] === template.TemplateID);
          if (templateRowIndex >= 0) {
            const templateRange = `templates!G${templateRowIndex + 1}:H${templateRowIndex + 1}`;
            await updateSheetValues(accessToken, spreadsheetId, templateRange, [[todayStr, nextGen]]);
          }
        } else {
          hasErrors = true;
          logger.error(`RecurringTaskScheduler: Failed to append task ${newTaskId}`);
        }
      } catch (err) {
        hasErrors = true;
        logger.error(`RecurringTaskScheduler: Error generating task for template ${template.TemplateID}`, err);
      }
      }
    }

    // Write final status
    const finalStatus = hasErrors ? 'failed' : 'success';
    await saveSettingValueWithRetry(accessToken, spreadsheetId, settingsRows, 'last_recurring_task_check_status', finalStatus);

    logger.info(`RecurringTaskScheduler: Execution complete. status=${finalStatus}, tasksGenerated=${generatedCount}, missedCyclesProcessed=${missedCyclesCount}`);
  } catch (err) {
    logger.error('RecurringTaskScheduler: Critical error in recurring task scheduler:', err);
  } finally {
    isRunning = false;
  }
}

// Helper functions for cycle key and date calculations
function calculateMissedCycles(recurrenceType: string, nextGenDate: string, todayStr: string, startDate: string): string[] {
  const missed: string[] = [];
  const next = new Date(nextGenDate);
  const today = new Date(todayStr);
  
  if (isNaN(next.getTime()) || isNaN(today.getTime())) {
    return [];
  }

  // If nextGenDate is today or in the future, no missed cycles
  if (next >= today) {
    return [];
  }

  // Calculate missed cycles based on recurrence type
  let current = new Date(next);
  
  switch (recurrenceType) {
    case 'Daily':
      while (current < today) {
        missed.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
      break;
    case 'Weekly':
      while (current < today) {
        missed.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 7);
      }
      break;
    case 'Monthly':
      while (current < today) {
        missed.push(current.toISOString().split('T')[0]);
        current.setMonth(current.getMonth() + 1);
      }
      break;
    case 'Quarterly':
      while (current < today) {
        missed.push(current.toISOString().split('T')[0]);
        current.setMonth(current.getMonth() + 3);
      }
      break;
    case 'Half-yearly':
      while (current < today) {
        missed.push(current.toISOString().split('T')[0]);
        current.setMonth(current.getMonth() + 6);
      }
      break;
  }

  return missed;
}

function generateCycleKey(recurrenceType: string, dateStr: string, anchorDate?: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  
  switch (recurrenceType) {
    case 'Daily': {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    case 'Weekly': {
      const weekNumber = getWeekNumber(date);
      return `${year}-W${String(weekNumber).padStart(2, '0')}`;
    }
    case 'Monthly': {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    }
    case 'Quarterly': {
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      return `${year}-Q${quarter}`;
    }
    case 'Half-yearly': {
      const half = date.getMonth() < 6 ? 1 : 2;
      return `${year}-H${half}`;
    }
    default:
      return `${year}-${dateStr}`;
  }
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function calculateDueDate(recurrenceType: string, startDateStr: string, anchorDateStr?: string): string {
  const startDate = new Date(startDateStr);
  
  switch (recurrenceType) {
    case 'Daily':
      return startDateStr; // Due same day as start
    case 'Weekly':
      const weekDue = new Date(startDate);
      weekDue.setDate(startDate.getDate() + 7);
      return weekDue.toISOString().split('T')[0];
    case 'Monthly':
      const month = new Date(startDate);
      month.setMonth(month.getMonth() + 1);
      month.setDate(0); // Last day of current month
      return month.toISOString().split('T')[0];
    case 'Quarterly':
      const quarter = new Date(startDate);
      quarter.setMonth(quarter.getMonth() + 3);
      quarter.setDate(0);
      return quarter.toISOString().split('T')[0];
    case 'Half-yearly':
      const halfYear = new Date(startDate);
      halfYear.setMonth(halfYear.getMonth() + 6);
      halfYear.setDate(0);
      return halfYear.toISOString().split('T')[0];
    default:
      return startDateStr;
  }
}

function calculateNextGenerationDate(recurrenceType: string, lastDateStr: string): string {
  const d = new Date(lastDateStr);
  if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];

  switch (recurrenceType) {
    case 'Daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'Weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'Monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'Quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'Half-yearly':
      d.setMonth(d.getMonth() + 6);
      break;
  }
  return d.toISOString().split('T')[0];
}

let schedulerIntervalId: NodeJS.Timeout | null = null;

/**
 * Starts the hourly checks for recurring task generation
 */
export function startRecurringTaskScheduler(): void {
  if (schedulerIntervalId) {
    return;
  }

  logger.info('RecurringTaskScheduler: Initializing hourly recurring task generation check...');

  // Execute once immediately on startup (will run if needed)
  checkAndGenerateRecurringTaskInstances().catch(err => {
    logger.error('RecurringTaskScheduler: Startup check failed', err);
  });

  // Check every hour
  schedulerIntervalId = setInterval(() => {
    checkAndGenerateRecurringTaskInstances().catch(err => {
      logger.error('RecurringTaskScheduler: Interval execution failed', err);
    });
  }, 60 * 60 * 1000);
}
