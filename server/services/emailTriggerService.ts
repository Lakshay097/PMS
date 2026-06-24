import { sendEmailAsUser } from './emailService';
import { logger } from '../utils/logger';
import { getOrCreateTaskEmailThread } from './emailLogService';

/**
 * All trigger functions pass taskId to sendEmailAsUser so it can persist
 * the real Gmail threadId+messageId after first send, keeping all emails
 * for a task in the same Gmail thread.
 *
 * threadTaskId = ParentTaskID ?? TaskID  — ensures follow-up tasks share
 * the parent's thread rather than creating a new one.
 */

export async function triggerTaskAssignmentEmail(
  assignerEmail: string,
  assignedToEmail: string,
  task: any
): Promise<void> {
  try {
    const recipients = assignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);
    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const threadInfo = await getOrCreateTaskEmailThread(threadTaskId, recipients[0]);

    logger.info(`Assignment email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    for (const recipient of recipients) {
      await sendEmailAsUser(
        assignerEmail,
        recipient,
        emailSubject,
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
        threadInfo?.threadId,   // real Gmail threadId ('' on first send)
        threadInfo?.messageId,  // last Gmail messageId for In-Reply-To
        threadTaskId,           // FIX: pass taskId so send can update thread record
      );
    }
  } catch (err) {
    logger.error('Error triggering task assignment email:', err);
  }
}

export async function triggerTaskDueSoonEmail(
  creatorEmail: string,
  assignedToEmail: string,
  task: any
): Promise<void> {
  try {
    const recipients = assignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const threadInfo = await getOrCreateTaskEmailThread(threadTaskId, recipients[0]);

    logger.info(`Due-soon email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    for (const recipient of recipients) {
      await sendEmailAsUser(
        creatorEmail,
        recipient,
        emailSubject,
        '',
        'task_due_soon',
        {
          task_name: task.Title,
          Title: task.Title,
          task_id: task.TaskID,
          TaskID: task.TaskID,
          due_date: task.DueDate,
          DueDate: task.DueDate,
          priority: task.Priority,
          Priority: task.Priority,
          assigned_to: recipient,
          AssignedToEmail: recipient,
          app_url: appUrl,
        },
        threadInfo?.threadId,
        threadInfo?.messageId,
        threadTaskId,
      );
    }
  } catch (err) {
    logger.error('Error triggering task due soon email:', err);
  }
}

export async function triggerTaskOverdueEmail(
  creatorEmail: string,
  assignedToEmail: string,
  task: any
): Promise<void> {
  try {
    const recipients = assignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const threadInfo = await getOrCreateTaskEmailThread(threadTaskId, recipients[0]);

    logger.info(`Overdue email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    for (const recipient of recipients) {
      await sendEmailAsUser(
        creatorEmail,
        recipient,
        emailSubject,
        '',
        'task_overdue',
        {
          task_name: task.Title,
          Title: task.Title,
          task_id: task.TaskID,
          TaskID: task.TaskID,
          due_date: task.DueDate,
          DueDate: task.DueDate,
          priority: task.Priority,
          Priority: task.Priority,
          assigned_to: recipient,
          AssignedToEmail: recipient,
          app_url: appUrl,
        },
        threadInfo?.threadId,
        threadInfo?.messageId,
        threadTaskId,
      );
    }
  } catch (err) {
    logger.error('Error triggering task overdue email:', err);
  }
}

export async function triggerReportSubmissionEmail(
  submitterEmail: string,
  allocatorEmail: string,
  task: any,
  reportContent: string
): Promise<void> {
  try {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const threadInfo = await getOrCreateTaskEmailThread(threadTaskId, allocatorEmail);

    logger.info(`Report email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    await sendEmailAsUser(
      submitterEmail,
      allocatorEmail,
      emailSubject,
      '',
      'report_submitted',
      {
        task_name: task.Title,
        task_id: task.TaskID,
        assigned_to: submitterEmail,
        report_content: reportContent,
        app_url: appUrl,
      },
      threadInfo?.threadId,
      threadInfo?.messageId,
      threadTaskId,
    );
  } catch (err) {
    logger.error('Error triggering report submission email:', err);
  }
}

export async function triggerTaskClosureEmail(
  closedByEmail: string,
  assignedToEmail: string,
  task: any,
  closeRemark: string
): Promise<void> {
  try {
    const recipients = assignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const threadInfo = await getOrCreateTaskEmailThread(threadTaskId, recipients[0]);

    logger.info(`Closure email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    for (const recipient of recipients) {
      await sendEmailAsUser(
        closedByEmail,
        recipient,
        emailSubject,
        '',
        'task_closed',
        {
          task_name: task.Title,
          task_id: task.TaskID,
          closed_by: closedByEmail,
          close_remark: closeRemark,
          completion_date: task.CompletionDate || new Date().toISOString().split('T')[0],
          app_url: appUrl,
        },
        threadInfo?.threadId,
        threadInfo?.messageId,
        threadTaskId,
      );
    }
  } catch (err) {
    logger.error('Error triggering task closure email:', err);
  }
}