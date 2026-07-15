import { sendEmailAsUser } from './emailService';
import { logger } from '../utils/logger';
import { getOrCreateTaskEmailThread } from './emailLogService';
import { generateGoogleSheetsToken, fetchSheetValues } from './googleSheetsService';
import { firestoreAdmin } from './firebaseAdmin';

/**
 * Reads a single email_enabled_{type} flag from the Firestore `settings` collection.
 * Returns true (enabled) if the key is absent or set to anything other than 'false'.
 */
async function isEmailTypeEnabled(type: string): Promise<boolean> {
  try {
    const key = `email_enabled_${type}`;
    const doc = await firestoreAdmin.collection('settings').doc(key).get();
    if (!doc.exists) return true; // default: enabled
    const value = doc.data()?.Value;
    return value !== 'false';
  } catch (err) {
    logger.warn(`isEmailTypeEnabled(${type}): error reading setting, defaulting to enabled`, err);
    return true;
  }
}

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

export async function triggerTaskCreationEmail(
  creatorEmail: string,
  assignedToEmail: string,
  task: any
): Promise<void> {
  try {
    if (!(await isEmailTypeEnabled('task_creation'))) {
      logger.info(`triggerTaskCreationEmail: disabled via email_enabled_task_creation setting`);
      return;
    }
    const recipients = assignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);
    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const threadInfo = await getOrCreateTaskEmailThread(threadTaskId, recipients[0]);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    const usersMap = await loadUsersNameMap();
    const createdByName = usersMap.get(creatorEmail.trim().toLowerCase()) || creatorEmail;

    // FIX: Use task.CreatedByEmail if creatorEmail not provided
    const actualCreatorEmail = creatorEmail || task.CreatedByEmail || task.CreatedBy || task.creatorEmail;
    if (!actualCreatorEmail) {
      logger.error(`[TRIGGER ERROR] No creator email found for task ${task.TaskID}`);
      return;
    }

    logger.info(`Creation email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    const allParticipants = threadInfo?.participants?.split(',').map((p: string) => p.trim()).filter(Boolean) || [];
    const toRecipients = allParticipants.filter((p: string) => p !== actualCreatorEmail && !recipients.includes(p));

    for (const recipient of recipients) {
      const assignedToName = usersMap.get(recipient.trim().toLowerCase()) || recipient;
      const result = await sendEmailAsUser(
        actualCreatorEmail,
        recipient,
        emailSubject,
        '',
        'template_task_creation',
        {
          TaskID: task.TaskID,
          Title: task.Title,
          Description: task.Description || task.description || '',
          Priority: task.Priority,
          DueDate: task.DueDate,
          AssignedToEmail: recipient,
          AssignedToName: assignedToName,
          AssignedByEmail: creatorEmail,
          AssignedByName: createdByName,
          AttachmentLink: task.AttachmentLink || 'No attachment',
          app_url: appUrl,
        },
        threadInfo?.threadId,
        threadInfo?.messageId,
        threadTaskId,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        toRecipients,
      );
      logger.info(`[TRIGGER DEBUG] Creation email to ${recipient}: success=${result.success}, error=${result.error || 'none'}`);
    }
  } catch (err) {
    logger.error('[TRIGGER ERROR] Error triggering task creation email:', err);
  }
}

export async function triggerTaskAssignmentEmail(
  assignerEmail: string,
  assignedToEmail: string,
  task: any
): Promise<void> {
  try {
    if (!(await isEmailTypeEnabled('task_assignment'))) {
      logger.info(`triggerTaskAssignmentEmail: disabled via email_enabled_task_assignment setting`);
      return;
    }
    logger.info(`[TRIGGER DEBUG] triggerTaskAssignmentEmail called: assigner=${assignerEmail}, assignedTo=${assignedToEmail}, task=${task.TaskID}`);
    const recipients = assignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);
    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const threadInfo = await getOrCreateTaskEmailThread(threadTaskId, recipients[0]);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    const usersMap = await loadUsersNameMap();
    // FIX: Use task.CreatedByEmail/AssignedByEmail if assignerEmail not provided
    const actualAssignerEmail = assignerEmail || task.CreatedByEmail || task.AssignedByEmail || task.CreatedBy || task.creatorEmail;
    if (!actualAssignerEmail) {
      logger.error(`[TRIGGER ERROR] No assigner email found for task ${task.TaskID}`);
      return;
    }
    const assignedByName = usersMap.get(actualAssignerEmail.trim().toLowerCase()) || actualAssignerEmail;

    logger.info(`Assignment email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    // All known participants for this task = assigner + all assignees.
    // Every email CCs everyone except the current sender and primary To,
    // so the full thread is visible to all parties regardless of who sends next.
    const allKnown = [
      actualAssignerEmail,
      ...recipients,
      ...(threadInfo?.participants?.split(',').map((p: string) => p.trim()).filter(Boolean) || []),
    ];
    const uniqueKnown = [...new Set(allKnown.map(e => e.toLowerCase()))];

    for (const recipient of recipients) {
      logger.info(`[TRIGGER DEBUG] Sending to recipient: ${recipient}`);
      const assignedToName = usersMap.get(recipient.trim().toLowerCase()) || recipient;

      // TO = everyone except sender (actualAssignerEmail) - first recipient is primary TO, others are additional TO
      const toRecipients = uniqueKnown
        .filter(e => e !== actualAssignerEmail.toLowerCase())
        .map(e => allKnown.find(a => a.toLowerCase() === e) || e);

      logger.info(`[TRIGGER DEBUG] TO recipients: ${toRecipients.join(', ') || 'none'}`);

      const result = await sendEmailAsUser(
        actualAssignerEmail,
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
          AttachmentLink: task.AttachmentLink || 'No attachment',
          app_url: appUrl,
        },
        threadInfo?.threadId,
        threadInfo?.messageId,
        threadTaskId,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        toRecipients,
      );
      logger.info(`[TRIGGER DEBUG] Email send result for ${recipient}: success=${result.success}, usedFallback=${result.usedFallback}, error=${result.error || 'none'}`);
      if (!result.success && result.error) {
        logger.error(`[TRIGGER ERROR] Failed to send email to ${recipient}: ${result.error}`);
      }
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
    if (!(await isEmailTypeEnabled('task_delay'))) {
      logger.info(`triggerTaskDueSoonEmail: disabled via email_enabled_task_delay setting`);
      return;
    }
    const recipients = assignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const threadInfo = await getOrCreateTaskEmailThread(threadTaskId, recipients[0]);

    const usersMap = await loadUsersNameMap();
    const assignedByName = usersMap.get(creatorEmail.trim().toLowerCase()) || creatorEmail;

    logger.info(`Due-soon email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    const allKnown = [
      creatorEmail,
      ...recipients,
      ...(threadInfo?.participants?.split(',').map((p: string) => p.trim()).filter(Boolean) || []),
    ];
    const uniqueKnown = [...new Set(allKnown.map(e => e.toLowerCase()))];

    for (const recipient of recipients) {
      const assignedToName = usersMap.get(recipient.trim().toLowerCase()) || recipient;
      const toRecipients = uniqueKnown
        .filter(e => e !== creatorEmail.toLowerCase())
        .map(e => allKnown.find(a => a.toLowerCase() === e) || e);

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
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        toRecipients,
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
    if (!(await isEmailTypeEnabled('task_delay'))) {
      logger.info(`triggerTaskOverdueEmail: disabled via email_enabled_task_delay setting`);
      return;
    }
    const recipients = assignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const threadInfo = await getOrCreateTaskEmailThread(threadTaskId, recipients[0]);

    const usersMap = await loadUsersNameMap();
    const assignedByName = usersMap.get(creatorEmail.trim().toLowerCase()) || creatorEmail;

    logger.info(`Overdue email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    const allKnown = [
      creatorEmail,
      ...recipients,
      ...(threadInfo?.participants?.split(',').map((p: string) => p.trim()).filter(Boolean) || []),
    ];
    const uniqueKnown = [...new Set(allKnown.map(e => e.toLowerCase()))];

    for (const recipient of recipients) {
      const assignedToName = usersMap.get(recipient.trim().toLowerCase()) || recipient;
      const toRecipients = uniqueKnown
        .filter(e => e !== creatorEmail.toLowerCase())
        .map(e => allKnown.find(a => a.toLowerCase() === e) || e);

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
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        toRecipients,
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
    if (!(await isEmailTypeEnabled('task_reporting'))) {
      logger.info(`triggerReportSubmissionEmail: disabled via email_enabled_task_reporting setting`);
      return;
    }
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;

    // Look up the existing thread row — same taskId key the assignment email created.
    // Pass allocatorEmail so they are added to participants if not already present.
    const threadInfo = await getOrCreateTaskEmailThread(threadTaskId, allocatorEmail);

    const usersMap = await loadUsersNameMap();
    const submittedByName = usersMap.get(submitterEmail.trim().toLowerCase()) || submitterEmail;
    const allocatorName = usersMap.get(allocatorEmail.trim().toLowerCase()) || allocatorEmail;

    logger.info(`Report email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    // All known parties: submitter, allocator, plus anyone already in thread.
    // CC = everyone except sender (submitterEmail) and primary To (allocatorEmail).
    const allKnown = [
      submitterEmail,
      allocatorEmail,
      ...(threadInfo?.participants?.split(',').map((p: string) => p.trim()).filter(Boolean) || []),
    ];
    const uniqueKnown = [...new Set(allKnown.map(e => e.toLowerCase()))];
    const toRecipients = uniqueKnown
      .filter(e => e !== submitterEmail.toLowerCase() && e !== allocatorEmail.toLowerCase())
      .map(e => allKnown.find(a => a.toLowerCase() === e) || e);

    // Send FROM the submitter's own Gmail account.
    // Threading is handled entirely by RFC In-Reply-To + References + identical Subject —
    // no gmailThreadId is passed to the Gmail API, so cross-account replies work correctly:
    // both the allocator and the submitter will see this as a reply in their own thread view.
    logger.info(`[TRIGGER DEBUG] Report email: sender=${submitterEmail}, to=${allocatorEmail}, toRecipients=${toRecipients.join(', ') || 'none'}`);

    await sendEmailAsUser(
      submitterEmail,   // sender = submitter (Lakshay sends from his own account)
      allocatorEmail,   // to = allocator (Utsav receives the report)
      emailSubject,
      '',
      'report_submitted',
      {
        task_name: task.Title,
        task_id: task.TaskID,
        Description: task.Description || task.description || '',
        assigned_by: submitterEmail,
        assigned_to: allocatorEmail,
        SubmittedByName: submittedByName,
        AllocatorName: allocatorName,
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
      undefined,
      toRecipients,
    );
  } catch (err) {
    logger.error('Error triggering report submission email:', err);
  }
}

export async function triggerTaskClosureEmail(
  closedByEmail: string,
  assignedToEmail: string,
  task: any,
  closeRemark: string,
  allocatorEmail?: string
): Promise<void> {
  try {
    if (!(await isEmailTypeEnabled('task_completion'))) {
      logger.info(`triggerTaskClosureEmail: disabled via email_enabled_task_completion setting`);
      return;
    }
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

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const threadTaskId = task.ParentTaskID || task.TaskID;
    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;

    // Primary recipient: allocator (task creator/assigner) if provided, else fall back to assignedToEmail
    const toEmail = allocatorEmail || assignedToEmail;
    const threadInfo = await getOrCreateTaskEmailThread(threadTaskId, toEmail);

    const usersMap = await loadUsersNameMap();
    const closedByName = usersMap.get(closedByEmail.trim().toLowerCase()) || closedByEmail;
    const toName = usersMap.get(toEmail.trim().toLowerCase()) || toEmail;

    logger.info(`Closure email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    // All known parties: closer, allocator, all assignees, plus anyone already in thread.
    // CC = everyone except sender (closedByEmail) and primary To (toEmail).
    const assignees = assignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);
    const allKnown = [
      closedByEmail,
      toEmail,
      ...assignees,
      ...(threadInfo?.participants?.split(',').map((p: string) => p.trim()).filter(Boolean) || []),
    ];
    const uniqueKnown = [...new Set(allKnown.map(e => e.toLowerCase()))];
    const toRecipients = uniqueKnown
      .filter(e => e !== closedByEmail.toLowerCase() && e !== toEmail.toLowerCase())
      .map(e => allKnown.find(a => a.toLowerCase() === e) || e);

    logger.info(`[TRIGGER DEBUG] Closure email: sender=${closedByEmail}, to=${toEmail}, toRecipients=${toRecipients.join(', ') || 'none'}`);

    await sendEmailAsUser(
      closedByEmail,  // sender = person closing the task (Lakshay)
      toEmail,        // to = allocator (Utsav) — mirrors report pattern
      emailSubject,
      '',
      'task_closed',
      {
        task_name: task.Title,
        task_id: task.TaskID,
        Description: task.Description || task.description || '',
        closed_by: closedByEmail,
        ClosedByName: closedByName,
        AssignedToName: toName,
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
      undefined,
      toRecipients,
    );
  } catch (err) {
    console.error('Task closure email FAILED:', err);
    logger.error('Error triggering task closure email:', err);
  }
}