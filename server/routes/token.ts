import { Router } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import * as tokenController from '../controllers/tokenController';

const router = Router();

/**
 * GET /api/token
 * Public endpoint to get Google Sheets Service Account token
 */
router.get('/token', asyncWrapper(tokenController.getTokenHandler));

export default router;
