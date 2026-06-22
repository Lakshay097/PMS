import { Router } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import * as sheetsController from '../controllers/sheetsController';

const router = Router();

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
