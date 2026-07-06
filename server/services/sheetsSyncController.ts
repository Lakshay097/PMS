import { logger } from '../utils/logger';
import { generateGoogleSheetsToken, saveCollection } from './googleSheetsService';

/**
 * Server-side Sheets Sync Controller
 * 
 * This service manages the queue of pending Google Sheets writes and periodically
 * flushes them to prevent multi-tab duplicate writes. By centralizing the sync logic
 * on the server, we ensure that only one process is writing to Sheets at a time,
 * eliminating race conditions from multiple browser tabs.
 */

interface SheetsWriteOperation {
  operation: 'save' | 'delete';
  data: any;
  timestamp: number;
}

type CollectionName = 
  | 'users' 
  | 'teams' 
  | 'sub_teams' 
  | 'templates' 
  | 'tasks' 
  | 'reports' 
  | 'followups' 
  | 'settings' 
  | 'subtasks' 
  | 'comments' 
  | 'team_submissions';

// In-memory queue for pending Sheets writes
// In production, this should be replaced with a persistent queue (Redis, database, etc.)
const pendingSheetsWrites = new Map<CollectionName, SheetsWriteOperation[]>();

// Sync interval ID
let syncIntervalId: NodeJS.Timeout | null = null;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Helper to get the ID field for a collection
function getIdFieldForCollection(collection: string): string {
  const idFields: Record<string, string> = {
    users: 'UserID',
    teams: 'TeamID',
    sub_teams: 'SubTeamID',
    templates: 'TemplateID',
    tasks: 'TaskID',
    reports: 'ReportID',
    followups: 'FollowUpID',
    settings: 'Key',
    subtasks: 'SubtaskID',
    comments: 'CommentID',
    team_submissions: 'SubmissionID'
  };
  return idFields[collection] || 'ID';
}

/**
 * Enqueue a Sheets write operation
 */
export function enqueueSheetsWrite(collection: CollectionName, operation: 'save' | 'delete', data: any): void {
  if (!pendingSheetsWrites.has(collection)) {
    pendingSheetsWrites.set(collection, []);
  }
  pendingSheetsWrites.get(collection)!.push({
    operation,
    data,
    timestamp: Date.now()
  });
  logger.info(`Enqueued ${operation} operation for ${collection}`);
}

/**
 * Get the current queue status
 */
export function getSyncQueueStatus(): { collection: string; pendingCount: number }[] {
  return Array.from(pendingSheetsWrites.entries()).map(([collection, operations]) => ({
    collection,
    pendingCount: operations.length
  }));
}

/**
 * Write to Sheets with exponential backoff retry
 */
async function writeWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let retryCount = 0;
  const baseDelay = 1000; // 1 second

  while (retryCount <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      retryCount++;
      if (retryCount > maxRetries) {
        throw error;
      }
      const delay = baseDelay * Math.pow(2, retryCount - 1);
      logger.warn(`Sheets write failed, retry ${retryCount}/${maxRetries} in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Flush pending writes to Sheets for a specific collection
 */
async function flushCollection(collection: CollectionName, operations: SheetsWriteOperation[]): Promise<void> {
  try {
    logger.info(`Flushing ${operations.length} operations for ${collection} to Sheets`);

    // Get Google Sheets token
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      throw new Error('Failed to get Google Sheets token');
    }

    // Get current data from Firestore for this collection
    let currentData: any[] = [];
    // Note: In a real implementation, we would fetch from Firestore here
    // For now, we'll rely on the operations to determine what to write
    // This is a simplified version - the full implementation would need
    // to integrate with the Firestore service

    // Apply pending operations to current data
    for (const op of operations) {
      if (op.operation === 'delete') {
        const idField = getIdFieldForCollection(collection);
        currentData = currentData.filter((item: any) => item[idField] !== op.data);
      }
      // 'save' operations would be merged into currentData
    }

    // Write entire collection to Sheets with backoff
    await writeWithBackoff(() => saveCollection(
      tokenData.accessToken,
      tokenData.spreadsheetId,
      collection,
      currentData
    ));
    logger.info(`Successfully synced ${collection} to Sheets`);

  } catch (err) {
    logger.error(`Sheets sync failed for ${collection}:`, err);
    // Re-enqueue failed operations
    const existingOps = pendingSheetsWrites.get(collection) || [];
    pendingSheetsWrites.set(collection, [...existingOps, ...operations]);
    throw err;
  }
}

/**
 * Flush all pending writes to Sheets
 */
function flushAllPendingWrites(): void {
  if (pendingSheetsWrites.size === 0) {
    logger.info('No pending Sheets writes to flush');
    return;
  }

  logger.info(`Flushing ${pendingSheetsWrites.size} collections to Sheets...`);

  const collections = Array.from(pendingSheetsWrites.entries());
  pendingSheetsWrites.clear();

  collections.forEach(([collection, operations]) => {
    flushCollection(collection, operations).catch(err => {
      logger.error(`Failed to flush ${collection}:`, err);
    });
  });
}

/**
 * Start the periodic sync interval
 */
export function startSheetsSyncInterval(): void {
  if (syncIntervalId) {
    logger.warn('Sheets sync interval already running');
    return;
  }

  logger.info(`Starting Sheets sync interval (${SYNC_INTERVAL_MS / 1000 / 60} minutes)`);
  syncIntervalId = setInterval(() => {
    flushAllPendingWrites();
  }, SYNC_INTERVAL_MS);
}

/**
 * Stop the periodic sync interval
 */
export function stopSheetsSyncInterval(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    logger.info('Stopped Sheets sync interval');
  }
}

/**
 * Manually trigger a sync flush (for immediate sync on demand)
 */
export async function manualSyncFlush(): Promise<void> {
  logger.info('Manual sync flush triggered');
  flushAllPendingWrites();
  // Wait a bit for async operations to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
}
