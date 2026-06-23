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
  participants: string; // Comma-separated list of participant emails
  createdAt: string;
  updatedAt: string;
}

/**
 * Initializes the email_logs sheet if it doesn't exist
 */
export async function initializeEmailLogsSheet(): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('Failed to get Google Sheets token for initialization');
      return false;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    
    // Check if email_logs sheet exists
    const existingValues = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'email_logs!A1:F1');
    
    if (existingValues && existingValues.length > 0) {
      // Sheet already exists with headers
      return true;
    }

    // Create the sheet first
    await createSheet(tokenData.accessToken, spreadsheetId, 'email_logs');

    // Create the sheet with headers
    const headers = [
      ['timestamp', 'sender', 'recipient', 'subject', 'status', 'error_message']
    ];

    const success = await appendSheetValues(tokenData.accessToken, spreadsheetId, 'email_logs', headers);
    
    if (success) {
      logger.info('Initialized email_logs sheet');
    }
    
    return success;
  } catch (err) {
    logger.error('Error initializing email_logs sheet:', err);
    return false;
  }
}

/**
 * Logs an email send attempt
 * @param log - Email log entry
 * @returns true if successful, false otherwise
 */
export async function logEmail(log: EmailLog): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('Failed to get Google Sheets token for logging');
      return false;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    
    const row = [
      log.timestamp,
      log.sender,
      log.recipient,
      log.subject,
      log.status,
      log.errorMessage || '',
    ];

    const success = await appendSheetValues(tokenData.accessToken, spreadsheetId, 'email_logs', [row]);

    if (!success) {
      logger.error('Failed to log email');
    }

    return success;
  } catch (err) {
    logger.error('Error logging email:', err);
    return false;
  }
}

/**
 * Logs a successful email send
 */
export async function logEmailSuccess(
  sender: string,
  recipient: string,
  subject: string
): Promise<boolean> {
  return logEmail({
    timestamp: new Date().toISOString(),
    sender,
    recipient,
    subject,
    status: 'sent',
  });
}

/**
 * Logs a failed email send
 */
export async function logEmailFailure(
  sender: string,
  recipient: string,
  subject: string,
  errorMessage: string
): Promise<boolean> {
  return logEmail({
    timestamp: new Date().toISOString(),
    sender,
    recipient,
    subject,
    status: 'failed',
    errorMessage,
  });
}

/**
 * Logs a retry attempt
 */
export async function logEmailRetry(
  sender: string,
  recipient: string,
  subject: string
): Promise<boolean> {
  return logEmail({
    timestamp: new Date().toISOString(),
    sender,
    recipient,
    subject,
    status: 'retrying',
  });
}

/**
 * Initializes the task_email_threads sheet if it doesn't exist
 */
export async function initializeTaskEmailThreadsSheet(): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('Failed to get Google Sheets token for initialization');
      return false;
    }

    const spreadsheetId = tokenData.spreadsheetId;

    // Check if task_email_threads sheet exists
    const existingValues = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'task_email_threads!A1:F1');

    if (existingValues && existingValues.length > 0) {
      // Sheet already exists with headers
      return true;
    }

    // Create the sheet first
    await createSheet(tokenData.accessToken, spreadsheetId, 'task_email_threads');

    // Create the sheet with headers
    const headers = [
      ['task_id', 'message_id', 'thread_id', 'participants', 'created_at', 'updated_at']
    ];

    const success = await appendSheetValues(tokenData.accessToken, spreadsheetId, 'task_email_threads', headers);

    if (success) {
      logger.info('Initialized task_email_threads sheet');
    }

    return success;
  } catch (err) {
    logger.error('Error initializing task_email_threads sheet:', err);
    return false;
  }
}

/**
 * Gets or creates a task email thread
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

    // Try to find existing thread for this task
    const existingRow = await fetchRowByFilter(tokenData.accessToken, spreadsheetId, 'task_email_threads', 0, taskId);

    if (existingRow) {
      // Update participants if new recipient not already in list
      const participants = existingRow[3] || '';
      const participantList = participants.split(',').map(p => p.trim()).filter(Boolean);
      
      if (!participantList.includes(initialRecipient)) {
        participantList.push(initialRecipient);
        const updatedParticipants = participantList.join(', ');
        const now = new Date().toISOString();
        
        await updateSheetValues(
          tokenData.accessToken,
          spreadsheetId,
          `task_email_threads!D${existingRow.length}:F${existingRow.length}`,
          [[updatedParticipants, existingRow[4], now]]
        );
        
        return {
          taskId: existingRow[0],
          messageId: existingRow[1],
          threadId: existingRow[2],
          participants: updatedParticipants,
          createdAt: existingRow[4],
          updatedAt: now,
        };
      }

      return {
        taskId: existingRow[0],
        messageId: existingRow[1],
        threadId: existingRow[2],
        participants: existingRow[3],
        createdAt: existingRow[4],
        updatedAt: existingRow[5],
      };
    }

    // Create new thread
    const now = new Date().toISOString();
    const messageId = `<${taskId}-${Date.now()}@pms.taskflow>`;
    const threadId = messageId;

    const newRow = [
      taskId,
      messageId,
      threadId,
      initialRecipient,
      now,
      now,
    ];

    const success = await appendSheetValues(tokenData.accessToken, spreadsheetId, 'task_email_threads', [newRow]);

    if (success) {
      logger.info(`Created new email thread for task ${taskId}`);
      return {
        taskId,
        messageId,
        threadId,
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
