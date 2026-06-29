import { generateGoogleSheetsToken, fetchSheetValues, appendSheetValues, createSheet, fetchRowByFilter, updateSheetValues } from './googleSheetsService';
import { logger } from '../utils/logger';

/**
 * Email log entry interface
 */
export interface EmailLog {
  timestamp: string;
  sender: string;
  recipient: string;
  subject: string;
  status: 'sent' | 'failed' | 'retrying';
  errorMessage?: string;
}

/**
 * Task email thread interface
 */
export interface TaskEmailThread {
  taskId: string;
  messageId: string;
  threadId: string;
  participants: string;
  createdAt: string;
  updatedAt: string;
}

export async function initializeEmailLogsSheet(): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('Failed to get Google Sheets token for initialization');
      return false;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const existingValues = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'email_logs!A1:F1');
    if (existingValues && existingValues.length > 0) return true;

    await createSheet(tokenData.accessToken, spreadsheetId, 'email_logs');
    const headers = [['timestamp', 'sender', 'recipient', 'subject', 'status', 'error_message']];
    const success = await appendSheetValues(tokenData.accessToken, spreadsheetId, 'email_logs', headers);
    if (success) logger.info('Initialized email_logs sheet');
    return success;
  } catch (err) {
    logger.error('Error initializing email_logs sheet:', err);
    return false;
  }
}

export async function logEmail(log: EmailLog): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) return false;

    const row = [log.timestamp, log.sender, log.recipient, log.subject, log.status, log.errorMessage || ''];
    return await appendSheetValues(tokenData.accessToken, tokenData.spreadsheetId, 'email_logs', [row]);
  } catch (err) {
    logger.error('Error logging email:', err);
    return false;
  }
}

export async function logEmailSuccess(sender: string, recipient: string, subject: string): Promise<boolean> {
  return logEmail({ timestamp: new Date().toISOString(), sender, recipient, subject, status: 'sent' });
}

export async function logEmailFailure(sender: string, recipient: string, subject: string, errorMessage: string): Promise<boolean> {
  return logEmail({ timestamp: new Date().toISOString(), sender, recipient, subject, status: 'failed', errorMessage });
}

export async function logEmailRetry(sender: string, recipient: string, subject: string): Promise<boolean> {
  return logEmail({ timestamp: new Date().toISOString(), sender, recipient, subject, status: 'retrying' });
}

export async function initializeTaskEmailThreadsSheet(): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) return false;

    const spreadsheetId = tokenData.spreadsheetId;
    const existingValues = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'task_email_threads!A1:F1');
    if (existingValues && existingValues.length > 0) return true;

    await createSheet(tokenData.accessToken, spreadsheetId, 'task_email_threads');
    const headers = [['task_id', 'message_id', 'thread_id', 'participants', 'created_at', 'updated_at']];
    const success = await appendSheetValues(tokenData.accessToken, spreadsheetId, 'task_email_threads', headers);
    if (success) logger.info('Initialized task_email_threads sheet');
    return success;
  } catch (err) {
    logger.error('Error initializing task_email_threads sheet:', err);
    return false;
  }
}

/**
 * Gets or creates a task email thread.
 * FIX: Scans the full sheet to find both the row data AND its 1-based sheet row index,
 * so participant updates write to the correct row (not existingRow.length which is column count).
 */
export async function getOrCreateTaskEmailThread(
  taskId: string,
  initialRecipient: string
): Promise<TaskEmailThread | null> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('Failed to get Google Sheets token');
      return null;
    }

    const spreadsheetId = tokenData.spreadsheetId;

    // FIX: Fetch all rows so we have the sheet row index alongside the data.
    // fetchRowByFilter only returns the row values, not its position — so we scan manually.
    const allValues = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'task_email_threads!A:F');

    if (allValues && allValues.length > 1) {
      for (let i = 1; i < allValues.length; i++) {
        const row = allValues[i];
        if (row[0] === taskId) {
          // Found existing thread — i is 0-based array index, sheet row is i+1
          const sheetRowNumber = i + 1; // correct 1-based sheet row

          const participants = row[3] || '';
          const participantList = participants.split(',').map((p: string) => p.trim()).filter(Boolean);

          if (!participantList.includes(initialRecipient)) {
            participantList.push(initialRecipient);
            const updatedParticipants = participantList.join(', ');
            const now = new Date().toISOString();

            // FIX: Use sheetRowNumber (correct row) not existingRow.length (column count)
            await updateSheetValues(
              tokenData.accessToken,
              spreadsheetId,
              `task_email_threads!D${sheetRowNumber}:F${sheetRowNumber}`,
              [[updatedParticipants, row[4], now]]
            );

            logger.info(`Thread found for task ${taskId}: threadId=${row[2]}, sheetRow=${sheetRowNumber}`);
            return {
              taskId: row[0],
              messageId: row[1],
              threadId: row[2],
              participants: updatedParticipants,
              createdAt: row[4],
              updatedAt: now,
            };
          }

          logger.info(`Thread found for task ${taskId}: threadId=${row[2]}, sheetRow=${sheetRowNumber}`);
          return {
            taskId: row[0],
            messageId: row[1],
            threadId: row[2],
            participants: row[3],
            createdAt: row[4],
            updatedAt: row[5],
          };
        }
      }
    }

    // No existing thread — create one.
    // Store a placeholder messageId; it will be replaced with the real Gmail messageId after first send.
    const now = new Date().toISOString();
    const placeholderMessageId = `<${taskId}-${Date.now()}@pms.taskflow>`;

    const newRow = [taskId, placeholderMessageId, '', initialRecipient, now, now];
    const success = await appendSheetValues(tokenData.accessToken, spreadsheetId, 'task_email_threads', [newRow]);

    if (success) {
      logger.info(`Created new email thread record for task ${taskId}`);
      return {
        taskId,
        messageId: placeholderMessageId,
        threadId: '', // empty — no Gmail threadId yet; first send will populate it
        participants: initialRecipient,
        createdAt: now,
        updatedAt: now,
      };
    }

    return null;
  } catch (err) {
    logger.error('Error getting or creating task email thread:', err);
    return null;
  }
}

/**
 * Updates the real Gmail threadId and messageId after first send.
 * Called after every successful send so thread_id stays current for reply chaining.
 */
export async function updateTaskEmailThreadId(
  taskId: string,
  gmailThreadId: string,
  gmailMessageId: string
): Promise<void> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) return;

    const values = await fetchSheetValues(
      tokenData.accessToken,
      tokenData.spreadsheetId,
      'task_email_threads!A:F'
    );
    if (!values || values.length < 2) return;

    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === taskId) {
        const sheetRowNumber = i + 1;
        const now = new Date().toISOString();
        // Update message_id (B), thread_id (C), updated_at (F)
        await updateSheetValues(
          tokenData.accessToken,
          tokenData.spreadsheetId,
          `task_email_threads!B${sheetRowNumber}:C${sheetRowNumber}`,
          [[gmailMessageId, gmailThreadId]]
        );
        await updateSheetValues(
          tokenData.accessToken,
          tokenData.spreadsheetId,
          `task_email_threads!F${sheetRowNumber}`,
          [[now]]
        );
        logger.info(`Updated Gmail thread for task ${taskId}: threadId=${gmailThreadId}, messageId=${gmailMessageId}`);
        return;
      }
    }
    logger.warn(`updateTaskEmailThreadId: no row found for taskId=${taskId}`);
  } catch (err) {
    logger.error('Error updating Gmail threadId:', err);
  }
}