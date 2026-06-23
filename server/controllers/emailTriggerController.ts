import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { triggerTaskAssignmentEmail, triggerTaskDueSoonEmail, triggerTaskOverdueEmail, triggerReportSubmissionEmail } from '../services/emailTriggerService';
import { logger } from '../utils/logger';

/**
 * POST /api/email/trigger/task-assignment
 * Triggers task assignment email
 */
export async function triggerTaskAssignmentHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { assignerEmail, assignedToEmail, task } = req.body;

    logger.info(`Task assignment email trigger request: assigner=${assignerEmail}, assignedTo=${assignedToEmail}, task=${task?.TaskID}`);

    if (!assignerEmail || !assignedToEmail || !task) {
      logger.warn('Missing required fields in task assignment email trigger');
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Fire and forget - don't wait for email to send
    triggerTaskAssignmentEmail(assignerEmail, assignedToEmail, task).catch(err => {
      logger.error('Error in fire-and-forget email trigger:', err);
    });

    res.json({
      success: true,
      message: 'Task assignment email triggered',
    });
  } catch (err) {
    logger.error('Error in task assignment email trigger:', err);
    res.status(500).json({ error: 'Failed to trigger email' });
  }
}

/**
 * POST /api/email/trigger/task-due-soon
 * Triggers task due soon email
 */
export async function triggerTaskDueSoonHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { creatorEmail, assignedToEmail, task } = req.body;

    if (!creatorEmail || !assignedToEmail || !task) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    triggerTaskDueSoonEmail(creatorEmail, assignedToEmail, task);

    res.json({
      success: true,
      message: 'Task due soon email triggered',
    });
  } catch (err) {
    logger.error('Error in task due soon email trigger:', err);
    res.status(500).json({ error: 'Failed to trigger email' });
  }
}

/**
 * POST /api/email/trigger/task-overdue
 * Triggers task overdue email
 */
export async function triggerTaskOverdueHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { creatorEmail, assignedToEmail, task } = req.body;

    if (!creatorEmail || !assignedToEmail || !task) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    triggerTaskOverdueEmail(creatorEmail, assignedToEmail, task);

    res.json({
      success: true,
      message: 'Task overdue email triggered',
    });
  } catch (err) {
    logger.error('Error in task overdue email trigger:', err);
    res.status(500).json({ error: 'Failed to trigger email' });
  }
}

/**
 * POST /api/email/trigger/report-submission
 * Triggers report submission email
 */
export async function triggerReportSubmissionHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { submitterEmail, allocatorEmail, task, reportContent } = req.body;

    if (!submitterEmail || !allocatorEmail || !task || !reportContent) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    triggerReportSubmissionEmail(submitterEmail, allocatorEmail, task, reportContent);

    res.json({
      success: true,
      message: 'Report submission email triggered',
    });
  } catch (err) {
    logger.error('Error in report submission email trigger:', err);
    res.status(500).json({ error: 'Failed to trigger email' });
  }
}
