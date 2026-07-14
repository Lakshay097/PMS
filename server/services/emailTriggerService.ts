import { sendEmailAsUser } from './emailService';
import { logger } from '../utils/logger';
import { getOrCreateTaskEmailThread } from './emailLogService';
import { generateGoogleSheetsToken, fetchSheetValues } from './googleSheetsService';

/**
 * Loads all users from Google Sheets and builds an in-memory map of email → FullName
 * for efficient name resolution in email templates.
 */
async function loadUsersNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.warn('loadUsersNameMap: No spreadsheet access, name resolution will fall back to emails');
      return map;
    }
    
    const usersData = await fetchSheetValues(
      tokenData.accessToken,
      tokenData.spreadsheetId,
      'users!A:Z'
    );
    
    if (!usersData || usersData.length < 2) {
      logger.warn('loadUsersNameMap: No users data found');
      return map;
    }
    
    // Parse users (skip header row at index 0)
    // Schema: UserID, FullName, Email, Role, ManagerEmail, TeamID, TeamName, Active, ...
    for (let i = 1; i < usersData.length; i++) {
      const row = usersData[i];
      const email = row[2]?.trim().toLowerCase(); // Email column (index 2)
      const fullName = row[1]?.trim(); // FullName column (index 1)
      
      if (email && fullName) {
        map.set(email, fullName);
      }
    }
    
    logger.info(`loadUsersNameMap: Loaded ${map.size} user names`);
  } catch (err) {
    logger.error('Error loading users name map:', err);
  }
  
  return map;
}

/**
 * Resolves a comma-separated string of emails to a comma-separated string of full names.
 * Falls back to the email address itself if no matching user is found.
 * Matches the split/trim/join pattern used in TaskDrawer.tsx for consistency.
 */
function resolveEmailsToNames(emails: string, usersMap: Map<string, string>): string {
  if (!emails || !emails.trim()) return '';
  
  return emails
    .split(',')                              // Split on comma
    .map(e => e.trim())                      // Trim whitespace
    .filter(Boolean)                         // Remove empty strings
    .map(email => {
      const normalized = email.toLowerCase();
      const name = usersMap.get(normalized);
      return name || email;                  // Fallback to email if no match
    })
    .join(', ');                             // Join with comma+space
}

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
    logger.info(`[TRIGGER DEBUG] triggerTaskAssignmentEmail called: assigner=${assignerEmail}, assignedTo=${assignedToEmail}, task=${task.TaskID}`);
    const recipients = assignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);
    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const threadInfo = await getOrCreateTaskEmailThread(threadTaskId, recipients[0]);

    const usersMap = await loadUsersNameMap();
    const assignedByName = usersMap.get(assignerEmail.trim().toLowerCase()) || assignerEmail;

    logger.info(`Assignment email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    // Get all thread participants for CC to keep emails in same thread
    const allParticipants = threadInfo?.participants?.split(',').map((p: string) => p.trim()).filter(Boolean) || [];
    const ccRecipients = allParticipants.filter((p: string) => p !== assignerEmail && !recipients.includes(p));

    for (const recipient of recipients) {
      logger.info(`[TRIGGER DEBUG] Sending to recipient: ${recipient}, CC: ${ccRecipients.join(', ') || 'none'}`);
      const assignedToName = usersMap.get(recipient.trim().toLowerCase()) || recipient;
      const result = await sendEmailAsUser(
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
          AssignedToName: assignedToName,
          AssignedByEmail: assignerEmail,
          AssignedByName: assignedByName,
          // FIX: attachment/URL was never passed to the template, so it could
          // never appear in the assignment email regardless of what the task had.
          AttachmentLink: task.AttachmentLink || 'No attachment',
        },
        threadInfo?.threadId,
        threadInfo?.messageId,
        threadTaskId,
        undefined, // teamId
        undefined, // subTeamId
        undefined, // weekOf
        undefined, // emailType
        ccRecipients, // ccEmails
      );
      logger.info(`[TRIGGER DEBUG] Email send result for ${recipient}: success=${result.success}, usedFallback=${result.usedFallback}`);
    }
  } catch (err) {
    logger.error('[TRIGGER ERROR] Error triggering task assignment email:', err);
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

    const usersMap = await loadUsersNameMap();
    const assignedByName = usersMap.get(creatorEmail.trim().toLowerCase()) || creatorEmail;

    logger.info(`Due-soon email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    // Get all thread participants for CC to keep emails in same thread
    const allParticipants = threadInfo?.participants?.split(',').map((p: string) => p.trim()).filter(Boolean) || [];
    const ccRecipients = allParticipants.filter((p: string) => p !== creatorEmail && !recipients.includes(p));

    for (const recipient of recipients) {
      const assignedToName = usersMap.get(recipient.trim().toLowerCase()) || recipient;
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
          Description: task.Description || task.description || '',
          TaskID: task.TaskID,
          due_date: task.DueDate,
          DueDate: task.DueDate,
          priority: task.Priority,
          Priority: task.Priority,
          assigned_to: recipient,
          AssignedToEmail: recipient,
          AssignedToName: assignedToName,
          AssignedByName: assignedByName,
          app_url: appUrl,
        },
        threadInfo?.threadId,
        threadInfo?.messageId,
        threadTaskId,
        undefined, // teamId
        undefined, // subTeamId
        undefined, // weekOf
        undefined, // emailType
        ccRecipients, // ccEmails
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

    const usersMap = await loadUsersNameMap();
    const assignedByName = usersMap.get(creatorEmail.trim().toLowerCase()) || creatorEmail;

    logger.info(`Overdue email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    // Get all thread participants for CC to keep emails in same thread
    const allParticipants = threadInfo?.participants?.split(',').map((p: string) => p.trim()).filter(Boolean) || [];
    const ccRecipients = allParticipants.filter((p: string) => p !== creatorEmail && !recipients.includes(p));

    for (const recipient of recipients) {
      const assignedToName = usersMap.get(recipient.trim().toLowerCase()) || recipient;
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
          Description: task.Description || task.description || '',
          TaskID: task.TaskID,
          due_date: task.DueDate,
          DueDate: task.DueDate,
          priority: task.Priority,
          Priority: task.Priority,
          assigned_to: recipient,
          AssignedToEmail: recipient,
          AssignedToName: assignedToName,
          AssignedByName: assignedByName,
          app_url: appUrl,
        },
        threadInfo?.threadId,
        threadInfo?.messageId,
        threadTaskId,
        undefined, // teamId
        undefined, // subTeamId
        undefined, // weekOf
        undefined, // emailType
        ccRecipients, // ccEmails
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

    const usersMap = await loadUsersNameMap();
    const submittedByName = usersMap.get(submitterEmail.trim().toLowerCase()) || submitterEmail;
    const allocatorName = usersMap.get(allocatorEmail.trim().toLowerCase()) || allocatorEmail;

    logger.info(`Report email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    // Get all thread participants for CC to keep emails in same thread
    // Include submitter so they can see their own report in the thread
    const allParticipants = threadInfo?.participants?.split(',').map((p: string) => p.trim()).filter(Boolean) || [];
    const ccRecipients = allParticipants.filter((p: string) => p !== allocatorEmail);

    await sendEmailAsUser(
      submitterEmail,
      allocatorEmail,
      emailSubject,
      '',
      'report_submitted',
      {
        task_name: task.Title,
        task_id: task.TaskID,
        Description: task.Description || task.description || '',
        assigned_by: submitterEmail,
        assigned_to: allocatorEmail,  // FIX: was incorrectly set to submitterEmail
        SubmittedByName: submittedByName,
        AllocatorName: allocatorName,  // Renamed from AssignedByName for clarity in this template
        report_content: reportContent,
        AttachmentLink: task.AttachmentLink || 'No attachment',
        app_url: appUrl,
      },
      threadInfo?.threadId,
      threadInfo?.messageId,
      threadTaskId,
      undefined, // teamId
      undefined, // subTeamId
      undefined, // weekOf
      undefined, // emailType
      ccRecipients, // ccEmails
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
    // Validate required fields before proceeding
    if (!closedByEmail) {
      logger.error('Task closure email FAILED: closedByEmail is undefined or empty');
      return;
    }
    if (!assignedToEmail) {
      logger.error('Task closure email FAILED: assignedToEmail is undefined or empty');
      return;
    }
    if (!task || !task.TaskID) {
      logger.error('Task closure email FAILED: task or task.TaskID is undefined');
      return;
    }

    const recipients = assignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const threadInfo = await getOrCreateTaskEmailThread(threadTaskId, recipients[0]);

    const usersMap = await loadUsersNameMap();
    const closedByName = usersMap.get(closedByEmail.trim().toLowerCase()) || closedByEmail;

    logger.info(`Closure email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    // Get all thread participants for CC to keep emails in same thread
    const allParticipants = threadInfo?.participants?.split(',').map((p: string) => p.trim()).filter(Boolean) || [];
    const ccRecipients = allParticipants.filter((p: string) => p !== closedByEmail && !recipients.includes(p));

    for (const recipient of recipients) {
      const assignedToName = usersMap.get(recipient.trim().toLowerCase()) || recipient;
      await sendEmailAsUser(
        closedByEmail,
        recipient,
        emailSubject,
        '',
        'task_closed',
        {
          task_name: task.Title,
          task_id: task.TaskID,
          Description: task.Description || task.description || '',
          closed_by: closedByEmail,
          ClosedByName: closedByName,
          AssignedToName: assignedToName,
          close_remark: closeRemark,
          completion_date: task.CompletionDate || new Date().toISOString().split('T')[0],
          app_url: appUrl,
        },
        threadInfo?.threadId,
        threadInfo?.messageId,
        threadTaskId,
        undefined, // teamId
        undefined, // subTeamId
        undefined, // weekOf
        undefined, // emailType
        ccRecipients, // ccEmails
      );
    }
  } catch (err) {
    console.error('Task closure email FAILED:', err);
    logger.error('Error triggering task closure email:', err);
  }
}