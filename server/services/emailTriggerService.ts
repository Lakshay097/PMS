import { sendEmailAsUser } from './emailService';
import { logger } from '../utils/logger';
import { getOrCreateTaskEmailThread } from './emailLogService';

/**
 * Triggers an email notification for task assignment
 * @param assignerEmail - Email of the person assigning the task
 * @param assignedToEmail - Email(s) of the assignee(s)
 * @param task - Task object with details
 */
export async function triggerTaskAssignmentEmail(
  assignerEmail: string,
  assignedToEmail: string,
  task: any
): Promise<void> {
  try {
    const recipients = assignedToEmail.split(',').map(e => e.trim()).filter(Boolean);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    // Get or create email thread for this task
    const threadInfo = await getOrCreateTaskEmailThread(task.TaskID, recipients[0]);

    for (const recipient of recipients) {
      await sendEmailAsUser(
        assignerEmail,
        recipient,
        `New task assigned: ${task.Title}`,
        '',
        'template_assigned_email',
        {
          TaskID: task.TaskID,
          Title: task.Title,
          Description: task.Description || task.description || '',
          Priority: task.Priority,
          DueDate: task.DueDate,
          AssignedToEmail: recipient,
          AssignedByEmail: assignerEmail,
        },
        threadInfo?.threadId,
        threadInfo?.messageId
      );
    }
  } catch (err) {
    logger.error('Error triggering task assignment email:', err);
    // Don't throw - email failures should not block the main flow
  }
}

/**
 * Triggers an email notification for task due soon (24 hours)
 * @param creatorEmail - Email of the task creator
 * @param assignedToEmail - Email of the assignee
 * @param task - Task object with details
 */
export async function triggerTaskDueSoonEmail(
  creatorEmail: string,
  assignedToEmail: string,
  task: any
): Promise<void> {
  try {
    const recipients = assignedToEmail.split(',').map(e => e.trim()).filter(Boolean);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    for (const recipient of recipients) {
      await sendEmailAsUser(
        creatorEmail,
        recipient,
        `Task due in 24 hours: ${task.Title}`,
        '',
        'task_due_soon',
        {
          task_name: task.Title,
          task_id: task.TaskID,
          due_date: task.DueDate,
          priority: task.Priority,
          assigned_to: recipient,
          app_url: appUrl,
        }
      );
    }
  } catch (err) {
    logger.error('Error triggering task due soon email:', err);
  }
}

/**
 * Triggers an email notification for overdue task
 * @param creatorEmail - Email of the task creator
 * @param assignedToEmail - Email of the assignee
 * @param task - Task object with details
 */
export async function triggerTaskOverdueEmail(
  creatorEmail: string,
  assignedToEmail: string,
  task: any
): Promise<void> {
  try {
    const recipients = assignedToEmail.split(',').map(e => e.trim()).filter(Boolean);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    for (const recipient of recipients) {
      await sendEmailAsUser(
        creatorEmail,
        recipient,
        `OVERDUE: ${task.Title}`,
        '',
        'task_overdue',
        {
          task_name: task.Title,
          task_id: task.TaskID,
          due_date: task.DueDate,
          priority: task.Priority,
          assigned_to: recipient,
          app_url: appUrl,
        }
      );
    }
  } catch (err) {
    logger.error('Error triggering task overdue email:', err);
  }
}

/**
 * Triggers an email notification for report submission
 * @param submitterEmail - Email of the report submitter
 * @param allocatorEmail - Email of the task allocator (creator)
 * @param task - Task object with details
 * @param reportContent - Content of the report
 */
export async function triggerReportSubmissionEmail(
  submitterEmail: string,
  allocatorEmail: string,
  task: any,
  reportContent: string
): Promise<void> {
  try {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    await sendEmailAsUser(
      submitterEmail,
      allocatorEmail,
      `Progress report submitted for: ${task.Title}`,
      '',
      'report_submitted',
      {
        task_name: task.Title,
        task_id: task.TaskID,
        assigned_to: submitterEmail,
        report_content: reportContent,
        app_url: appUrl,
      }
    );
  } catch (err) {
    logger.error('Error triggering report submission email:', err);
  }
}
