import { Router } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import * as jobRunsController from '../controllers/jobRunsController';

const router = Router();

/**
 * GET /api/job-runs
 * Admin-only endpoint to fetch job runs from Firestore
 */
router.get('/', authenticateToken, requireAdmin, asyncWrapper(jobRunsController.getJobRunsHandler));

/**
 * GET /api/job-runs/latest/:jobName
 * Admin-only endpoint to fetch the latest run for a specific job
 */
router.get('/latest/:jobName', authenticateToken, requireAdmin, asyncWrapper(jobRunsController.getLatestJobRunHandler));

export default router;
