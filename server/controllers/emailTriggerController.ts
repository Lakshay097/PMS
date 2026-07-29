import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { sendTriggeredEmail } from '../services/emailService';
import { triggerTaskDueSoonEmail, triggerTaskOverdueEmail } from '../services/emailTriggerService';
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

    const recipients = assignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);
    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    // Build HTML content from template variables
    const htmlContent = `
      <p>A new task has been created and assigned to you:</p>
      <p>
        <strong>Task ID:</strong> ${task.TaskID}<br>
        <strong>Title:</strong> ${task.Title}<br>
        <strong>Description:</strong> ${task.Description || ''}<br>
        <strong>Priority:</strong> ${task.Priority}<br>
        <strong>Due Date:</strong> ${task.DueDate}<br>
        <strong>Created By:</strong> ${creatorEmail}
      </p>
      <p>Please log in and start working on this task.</p>
      <p><a href="${appUrl}">Open PMS</a></p>
    `;

    sendTriggeredEmail({
      actingUserEmail: creatorEmail,
      to: recipients,
      subject: emailSubject,
      html: htmlContent,
      replyTo: creatorEmail,
    }).catch(err => {
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

    const recipients = assignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);
    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    // Build HTML content from template variables
    const htmlContent = `
      <p>You have been assigned a new task:</p>
      <p>
        <strong>Task ID:</strong> ${task.TaskID}<br>
        <strong>Title:</strong> ${task.Title}<br>
        <strong>Description:</strong> ${task.Description || ''}<br>
        <strong>Priority:</strong> ${task.Priority}<br>
        <strong>Due Date:</strong> ${task.DueDate}<br>
        <strong>Assigned By:</strong> ${assignerEmail}
      </p>
      <p>Please review and start working on this task.</p>
      <p><a href="${appUrl}">Open PMS</a></p>
    `;

    // Fire and forget - don't wait for email to send
    sendTriggeredEmail({
      actingUserEmail: assignerEmail,
      to: recipients,
      subject: emailSubject,
      html: htmlContent,
      replyTo: assignerEmail,
    }).catch(err => {
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

    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    // Build HTML content from template variables
    const htmlContent = `
      <p>A progress report has been submitted:</p>
      <p>
        <strong>Task:</strong> ${task.Title}<br>
        <strong>Task ID:</strong> ${task.TaskID}<br>
        <strong>Submitted By:</strong> ${submitterEmail}
      </p>
      <p><strong>Report Content:</strong></p>
      <p>${reportContent}</p>
      <p><a href="${appUrl}">Open PMS</a></p>
    `;

    sendTriggeredEmail({
      actingUserEmail: submitterEmail,
      to: [allocatorEmail],
      subject: emailSubject,
      html: htmlContent,
      replyTo: submitterEmail,
    }).catch(err => {
      logger.error('Error in fire-and-forget report submission email trigger:', err);
    });

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

    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const toEmail = allocatorEmail || assignedToEmail;
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    // Build HTML content from template variables
    const htmlContent = `
      <p>The following task has been marked as closed:</p>
      <p>
        <strong>Task:</strong> ${task.Title}<br>
        <strong>Task ID:</strong> ${task.TaskID}<br>
        <strong>Closed By:</strong> ${closedByEmail}
      </p>
      <p><strong>Close Remarks:</strong></p>
      <p>${closeRemark}</p>
      <p><a href="${appUrl}">Open PMS</a></p>
    `;

    sendTriggeredEmail({
      actingUserEmail: closedByEmail,
      to: [toEmail],
      subject: emailSubject,
      html: htmlContent,
      replyTo: closedByEmail,
    }).catch(err => {
      logger.error('Error in fire-and-forget closure email trigger:', err);
    });
    res.json({ success: true, message: 'Task closure email triggered' });
  } catch (err) {
    logger.error('Error in task closure email trigger:', err);
    res.status(500).json({ error: 'Failed to trigger email' });
  }
}