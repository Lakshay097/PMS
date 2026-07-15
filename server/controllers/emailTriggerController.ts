import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { triggerTaskCreationEmail, triggerTaskAssignmentEmail, triggerTaskDueSoonEmail, triggerTaskOverdueEmail, triggerReportSubmissionEmail, triggerTaskClosureEmail } from '../services/emailTriggerService';
import { logger } from '../utils/logger';

/**
 * POST /api/email/trigger/task-creation
 * Triggers task creation email (notifies assignees a new task was created for them)
 */
export async function triggerTaskCreationHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { creatorEmail, assignedToEmail, task } = req.body;

    logger.info(`[CONTROLLER DEBUG] Task creation email trigger request: creator=${creatorEmail}, assignedTo=${assignedToEmail}, task=${task?.TaskID}`);

    if (!creatorEmail || !assignedToEmail || !task) {
      logger.warn('[CONTROLLER ERROR] Missing required fields in task creation email trigger');
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    // Fire and forget
    res.json({ success: true, message: 'Task creation email triggered' });

    triggerTaskCreationEmail(creatorEmail, assignedToEmail, task).catch(err => {
      logger.error('[CONTROLLER ERROR] Error in fire-and-forget task creation email trigger:', err);
    });
  } catch (err) {
    logger.error('[CONTROLLER ERROR] Error in task creation email trigger:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to trigger email' });
    }
  }
}

/**
 * POST /api/email/trigger/task-assignment
 * Triggers task assignment email
 */
export async function triggerTaskAssignmentHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { assignerEmail, assignedToEmail, task } = req.body;

    logger.info(`[CONTROLLER DEBUG] Task assignment email trigger request: assigner=${assignerEmail}, assignedTo=${assignedToEmail}, task=${task?.TaskID}`);
    logger.info(`[CONTROLLER DEBUG] Request body: ${JSON.stringify(req.body)}`);

    if (!assignerEmail || !assignedToEmail || !task) {
      logger.warn('[CONTROLLER ERROR] Missing required fields in task assignment email trigger');
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    // Send response immediately, then trigger email in background
    res.json({
      success: true,
      message: 'Task assignment email triggered',
    });

    logger.info('[CONTROLLER DEBUG] Response sent, now triggering email in background');

    // Fire and forget - don't wait for email to send
    triggerTaskAssignmentEmail(assignerEmail, assignedToEmail, task).catch(err => {
      logger.error('[CONTROLLER ERROR] Error in fire-and-forget email trigger:', err);
    });

    logger.info('[CONTROLLER DEBUG] Email trigger function called');
  } catch (err) {
    logger.error('[CONTROLLER ERROR] Error in task assignment email trigger:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to trigger email' });
    }
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

/**
 * POST /api/email/trigger/task-closed
 * Triggers task closure email
 */
export async function triggerTaskClosureHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { closedByEmail, assignedToEmail, allocatorEmail, task, closeRemark } = req.body;
    if (!closedByEmail || !assignedToEmail || !task || !closeRemark) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    triggerTaskClosureEmail(closedByEmail, assignedToEmail, task, closeRemark, allocatorEmail).catch(err => {
      logger.error('Error in fire-and-forget closure email trigger:', err);
    });
    res.json({ success: true, message: 'Task closure email triggered' });
  } catch (err) {
    logger.error('Error in task closure email trigger:', err);
    res.status(500).json({ error: 'Failed to trigger email' });
  }
}