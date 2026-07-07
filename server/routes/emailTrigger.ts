import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  triggerTaskAssignmentHandler,
  triggerTaskDueSoonHandler,
  triggerTaskOverdueHandler,
  triggerReportSubmissionHandler,
  triggerTaskClosureHandler,
} from '../controllers/emailTriggerController';

const router = Router();

router.post('/task-assignment', authenticateToken, triggerTaskAssignmentHandler);
router.post('/task-due-soon', authenticateToken, triggerTaskDueSoonHandler);
router.post('/task-overdue', authenticateToken, triggerTaskOverdueHandler);
router.post('/report-submission', authenticateToken, triggerReportSubmissionHandler);
router.post('/task-closed', authenticateToken, triggerTaskClosureHandler);

export default router;