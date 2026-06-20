import { Router } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { authenticateToken } from '../middleware/auth';
import * as uploadController from '../controllers/uploadController';

const router = Router();

/**
 * POST /api/upload-file
 * Protected endpoint to upload files to Google Drive
 */
router.post('/upload-file', authenticateToken, asyncWrapper(uploadController.uploadFileHandler));

export default router;
