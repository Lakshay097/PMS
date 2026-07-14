import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { logger } from '../utils/logger';
import {
  triggerTaskAssignmentHandler,
  triggerTaskDueSoonHandler,
  triggerTaskOverdueHandler,
  triggerReportSubmissionHandler,
  triggerTaskClosureHandler,
} from '../controllers/emailTriggerController';

const router = Router();

router.post('/task-assignment', (req, res, next) => {
  logger.info('[ROUTER DEBUG] Email trigger route hit BEFORE auth: /task-assignment');
  next();
}, authenticateToken, (req, res) => {
  logger.info('[ROUTER DEBUG] Email trigger route hit AFTER auth: /task-assignment');
  triggerTaskAssignmentHandler(req, res);
});
router.post('/task-due-soon', authenticateToken, triggerTaskDueSoonHandler);
router.post('/task-overdue', authenticateToken, triggerTaskOverdueHandler);
router.post('/report-submission', authenticateToken, triggerReportSubmissionHandler);
router.post('/task-closed', authenticateToken, triggerTaskClosureHandler);

export default router;