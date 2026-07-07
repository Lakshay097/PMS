import { logger } from '../utils/logger';
import { generateGoogleSheetsToken, saveCollection } from './googleSheetsService';
import { firestoreAdmin } from './firebaseAdmin';

/**
 * Server-side Sheets Sync Controller
 *
 * This service manages the queue of pending Google Sheets writes and periodically
 * flushes them to prevent multi-tab duplicate writes. By centralizing the sync logic
 * on the server, we ensure that only one process is writing to Sheets at a time,
 * eliminating race conditions from multiple browser tabs.
 *
 * FIX (2026-07): flushCollection() previously initialized `currentData` to an
 * empty array and never populated it from Firestore — the comment in the
 * original code admitted "In a real implementation, we would fetch from
 * Firestore here." Because of this, every scheduled/queued sync operation
 * called `saveCollection(..., [])`, which saveCollection() then no-ops on
 * (see the `data.length === 0` guard). This means password hashes, approval
 * status, and any other field written on the Firestore side by dbService
 * (e.g. AdminPanel-created users) NEVER actually reached Google Sheets —
 * which matters because login authentication reads from Sheets, not
 * Firestore. This is the root cause of users appearing to have a valid
 * password in Firestore but an empty password at the login screen.
 *
 * The fix below actually fetches the current collection from Firestore,
 * applies the queued 'save'/'delete' operations on top of it (keyed by each
 * collection's ID field, never by array position), and only then writes the
 * merged result to Sheets.
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
 * Fetch the current state of a collection from Firestore.
 * This is the piece that was missing entirely before this fix — without it,
 * flushCollection() had nothing real to merge queued operations into.
 */
async function fetchCurrentCollectionFromFirestore(collection: CollectionName): Promise<any[]> {
  const snapshot = await firestoreAdmin.collection(collection).get();
  return snapshot.docs.map(doc => doc.data());
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

    // FIX: actually fetch the current data from Firestore instead of
    // starting from an empty array. This is the source of truth that the
    // queued operations get merged into before writing to Sheets.
    let currentData: any[] = await fetchCurrentCollectionFromFirestore(collection);

    const idField = getIdFieldForCollection(collection);

    // Apply pending operations to current data, keyed by ID field —
    // never by array position/index, to avoid the row-corruption bug
    // this whole sync path is meant to avoid introducing.
    for (const op of operations) {
      if (op.operation === 'delete') {
        currentData = currentData.filter((item: any) => item[idField] !== op.data);
      } else if (op.operation === 'save') {
        const incoming = op.data;
        const incomingId = incoming?.[idField];
        const idx = currentData.findIndex((item: any) => item[idField] === incomingId);
        if (idx >= 0) {
          currentData[idx] = { ...currentData[idx], ...incoming };
        } else {
          currentData.push(incoming);
        }
      }
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
  await flushAllPendingWrites();
}

/**
 * Full sync: sync entire collection from Firestore to Sheets
 * Use this when Firestore has data that Sheets doesn't (e.g., initial data load)
 */
export async function fullSyncCollection(collection: CollectionName): Promise<void> {
  try {
    logger.info(`Starting full sync for ${collection} from Firestore to Sheets`);

    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      throw new Error('Failed to get Google Sheets token');
    }

    // Fetch all data from Firestore
    const currentData = await fetchCurrentCollectionFromFirestore(collection);

    if (currentData.length === 0) {
      logger.warn(`No data found in Firestore for ${collection}, skipping sync`);
      return;
    }

    // Write entire collection to Sheets
    await writeWithBackoff(() => saveCollection(
      tokenData.accessToken,
      tokenData.spreadsheetId,
      collection,
      currentData
    ));

    logger.info(`Successfully synced ${currentData.length} records from Firestore to Sheets for ${collection}`);
  } catch (err) {
    logger.error(`Full sync failed for ${collection}:`, err);
    throw err;
  }
}