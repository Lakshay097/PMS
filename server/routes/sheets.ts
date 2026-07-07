import { Router } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import * as sheetsController from '../controllers/sheetsController';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import * as sheetsSyncController from '../services/sheetsSyncController';

const router = Router();

/**
 * POST /api/sheets/enqueue-write
 * Enqueue a Sheets write operation to the server-side queue
 */
router.post('/enqueue-write', authenticateToken, asyncWrapper(async (req: AuthRequest, res) => {
  const { collection, operation, data } = req.body;
  
  if (!collection || !operation || !data) {
    return res.status(400).json({ error: 'Missing required fields: collection, operation, data' });
  }

  if (!['save', 'delete'].includes(operation)) {
    return res.status(400).json({ error: 'Invalid operation. Must be "save" or "delete"' });
  }

  sheetsSyncController.enqueueSheetsWrite(collection, operation, data);
  
  res.json({ success: true, message: 'Operation enqueued' });
}));

/**
 * GET /api/sheets/sync-status
 * Get the current sync queue status
 */
router.get('/sync-status', authenticateToken, asyncWrapper(async (req: AuthRequest, res) => {
  const status = sheetsSyncController.getSyncQueueStatus();
  res.json({ queue: status });
}));

/**
 * POST /api/sheets/flush
 * Manually trigger a sync flush (admin only)
 */
router.post('/flush', authenticateToken, asyncWrapper(async (req: AuthRequest, res) => {
  await sheetsSyncController.manualSyncFlush();
  res.json({ success: true, message: 'Sync flush triggered' });
}));

/**
 * POST /api/sheets/full-sync/:collection
 * Full sync a collection from Firestore to Sheets (admin only)
 */
router.post('/full-sync/:collection', authenticateToken, asyncWrapper(async (req: AuthRequest, res) => {
  const { collection } = req.params;
  await sheetsSyncController.fullSyncCollection(collection as any);
  res.json({ success: true, message: `Full sync completed for ${collection}` });
}));

/**
 * GET /api/sheets/:spreadsheetId/metadata
 * Get spreadsheet metadata
 */
router.get('/:spreadsheetId/metadata', asyncWrapper(sheetsController.getSpreadsheetMetadataHandler));

/**
 * GET /api/sheets/spreadsheet
 * Get or create spreadsheet
 */
router.get('/spreadsheet', asyncWrapper(sheetsController.getOrCreateSpreadsheetHandler));

/**
 * GET /api/sheets/:spreadsheetId/values/:range
 * Get sheet values
 */
router.get('/:spreadsheetId/values/:range', asyncWrapper(sheetsController.getValuesHandler));

/**
 * PUT /api/sheets/:spreadsheetId/values/:range
 * Update sheet values
 */
router.put('/:spreadsheetId/values/:range', asyncWrapper(sheetsController.updateValuesHandler));

/**
 * POST /api/sheets/:spreadsheetId/values/:range/clear
 * Clear sheet values
 */
router.post('/:spreadsheetId/values/:range/clear', asyncWrapper(sheetsController.clearValuesHandler));

/**
 * POST /api/sheets/:spreadsheetId/values/:range/append
 * Append sheet values
 */
router.post('/:spreadsheetId/values/:range/append', asyncWrapper(sheetsController.appendValuesHandler));

/**
 * GET /api/sheets/:spreadsheetId/values:batchGet
 * Batch get sheet values
 */
router.get('/:spreadsheetId/values:batchGet', asyncWrapper(sheetsController.batchGetValuesHandler));

export default router;
