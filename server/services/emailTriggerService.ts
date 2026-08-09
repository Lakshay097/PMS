import { sendEmailAsUser } from './emailService';
import { logger } from '../utils/logger';
import { getOrCreateTaskEmailThread } from './emailLogService';
import { generateGoogleSheetsToken, fetchSheetValues } from './googleSheetsService';
import { ttlCache } from '../utils/ttlCache';
import { getAllSettingsCached } from '../routes/firestore';
import { firestoreAdmin } from './firebaseAdmin';

// ---------------------------------------------------------------------------
// Server-side idempotency guard for task emails
// Prevents duplicate sends when the frontend fires the trigger endpoint more
// than once for the same (taskId, recipientEmail) within a short window.
// Uses Firestore with a TTL-style approach: we .create() a short-lived doc;
// concurrent/duplicate calls see ALREADY_EXISTS and bail out.
// The doc is auto-cleaned by Firestore TTL (field: expiresAt, configured in
// Firestore console) or left to expire naturally — it's only a few KB.
// ---------------------------------------------------------------------------
const EMAIL_DEDUP_WINDOW_MS = 90 * 1000; // 90 seconds

/**
 * Tries to claim a send slot for the given (taskId, recipient, emailType).
 * Returns true if this caller owns the slot (should proceed with send).
 * Returns false if another caller already claimed it within the dedup window.
 */
async function tryClaimEmailSlot(
  taskId: string,
  recipientEmail: string,
  emailType: string
): Promise<boolean> {
  const key = `${emailType}_${taskId}_${recipientEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  const docRef = firestoreAdmin.collection('email_send_locks').doc(key);
  const expiresAt = new Date(Date.now() + EMAIL_DEDUP_WINDOW_MS);
  try {
    await docRef.create({
      taskId,
      recipientEmail,
      emailType,
      claimedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    return true; // we own this slot
  } catch (err: any) {
    if (err.code === 6 || String(err.message).includes('ALREADY_EXISTS')) {
      // Slot already claimed — check if it has expired (clock-based fallback)
      try {
        const existing = await docRef.get();
        if (existing.exists) {
          const data = existing.data();
          if (data?.expiresAt && new Date(data.expiresAt) < new Date()) {
            // Previous slot has expired — reclaim it
            await docRef.set({
              taskId,
              recipientEmail,
              emailType,
              claimedAt: new Date().toISOString(),
              expiresAt: expiresAt.toISOString(),
            });
            logger.info(`[EMAIL DEDUP] Reclaimed expired slot for ${emailType} task=${taskId} to=${recipientEmail}`);
            return true;
          }
        }
      } catch (checkErr) {
        logger.warn(`[EMAIL DEDUP] Error checking expired slot for ${key}:`, checkErr);
      }
      logger.info(`[EMAIL DEDUP] Duplicate send blocked for ${emailType} task=${taskId} to=${recipientEmail}`);
      return false;
    }
    // Unexpected Firestore error — fail open (let the send proceed) so emails
    // are never silently dropped due to a storage issue.
    logger.warn(`[EMAIL DEDUP] Firestore error claiming slot for ${key}, proceeding with send:`, err);
    return true;
  }
}

/**
 * Tries to claim a task-level send slot for consolidated emails.
 * Uses a hash of the recipient list to allow legitimate reassignments with different people.
 * Returns true if this caller owns the slot (should proceed with send).
 * Returns false if another caller already claimed it within the dedup window.
 */
async function tryClaimTaskLevelSlot(
  taskId: string,
  recipients: string[],
  emailType: string
): Promise<boolean> {
  // Create a simple hash of the recipient list for uniqueness
  const recipientHash = recipients
    .map(r => r.trim().toLowerCase())
    .sort()
    .join(',');
  const key = `${emailType}_task_${taskId}_${recipientHash.replace(/[^a-z0-9@.,]/g, '_')}`;
  const docRef = firestoreAdmin.collection('email_send_locks').doc(key);
  const expiresAt = new Date(Date.now() + EMAIL_DEDUP_WINDOW_MS);
  try {
    await docRef.create({
      taskId,
      recipientEmail: recipients.join(', '), // Store actual emails, not synthetic string
      emailType,
      claimedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    return true; // we own this slot
  } catch (err: any) {
    if (err.code === 6 || String(err.message).includes('ALREADY_EXISTS')) {
      // Slot already claimed — check if it has expired (clock-based fallback)
      try {
        const existing = await docRef.get();
        if (existing.exists) {
          const data = existing.data();
          if (data?.expiresAt && new Date(data.expiresAt) < new Date()) {
            // Previous slot has expired — reclaim it
            await docRef.set({
              taskId,
              recipientEmail: recipients.join(', '),
              emailType,
              claimedAt: new Date().toISOString(),
              expiresAt: expiresAt.toISOString(),
            });
            logger.info(`[EMAIL DEDUP] Reclaimed expired task-level slot for ${emailType} task=${taskId}`);
            return true;
          }
        }
      } catch (checkErr) {
        logger.warn(`[EMAIL DEDUP] Error checking expired task-level slot for ${key}:`, checkErr);
      }
      logger.info(`[EMAIL DEDUP] Duplicate task-level send blocked for ${emailType} task=${taskId}`);
      return false;
    }
    // Unexpected Firestore error — fail open (let the send proceed) so emails
    // are never silently dropped due to a storage issue.
    logger.warn(`[EMAIL DEDUP] Firestore error claiming task-level slot for ${key}, proceeding with send:`, err);
    return true;
  }
}

/**
 * Reads a single email_enabled_{type} flag from the cached settings collection.
 * Uses the shared settings TTL cache (2-minute TTL) instead of a live Firestore
 * read on every invocation. A toggled setting takes effect within the TTL window.
 * Returns true (enabled) if the key is absent or set to anything other than 'false'.
 */
async function isEmailTypeEnabled(type: string): Promise<boolean> {
  try {
    const key = `email_enabled_${type}`;
    const settings = await getAllSettingsCached();
    const setting = (settings as Array<{ Key: string; Value: string }>).find(s => s.Key === key);
    if (!setting) return true; // default: enabled
    return setting.Value !== 'false';
  } catch (err) {
    logger.warn(`isEmailTypeEnabled(${type}): error reading setting, defaulting to enabled`, err);
    return true;
  }
}

const USERS_CACHE_KEY = 'emailTrigger:usersNameMap';
const USERS_CACHE_TTL = 5 * 60 * 1000; // 5 min — user names change rarely

/**
 * Loads all users from Google Sheets and builds an in-memory map of email → FullName
 * for efficient name resolution in email templates.
 */
async function loadUsersNameMap(): Promise<Map<string, string>> {
  return ttlCache.getOrFetch(USERS_CACHE_KEY, USERS_CACHE_TTL, async () => {
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
  });
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
 * Gets the template name for a given email type from Firestore mappings.
 * Falls back to default template names if no mapping exists.
 */
async function getTemplateForEmailType(emailType: string): Promise<string> {
  try {
    const defaultMappings: Record<string, string> = {
      task_creation: 'template_task_creation',
      task_assignment: 'template_assigned_email',
      task_delay: 'template_delayed_email',
      task_reporting: 'template_task_reporting',
      task_completion: 'template_task_completion',
      scheduled_reminders: 'template_scheduled_reminder',
      scheduled_report_first: 'template_scheduled_report_first',
      report_submitted: 'template_report_submitted',
    };

    const mappingsDoc = await firestoreAdmin.collection('settings').doc('email_template_mappings').get();
    if (mappingsDoc.exists) {
      const mappings = mappingsDoc.data();
      const templateName = mappings?.[emailType];
      if (templateName) {
        logger.info(`[TEMPLATE MAPPING] Using custom template '${templateName}' for email type '${emailType}'`);
        return templateName;
      }
    }

    // Fall back to default
    const defaultTemplate = defaultMappings[emailType];
    logger.info(`[TEMPLATE MAPPING] Using default template '${defaultTemplate}' for email type '${emailType}'`);
    return defaultTemplate;
  } catch (err) {
    logger.warn(`[TEMPLATE MAPPING] Error getting mapping for ${emailType}, using default`, err);
    const defaultMappings: Record<string, string> = {
      task_creation: 'template_task_creation',
      task_assignment: 'template_assigned_email',
      task_delay: 'template_delayed_email',
      task_reporting: 'template_task_reporting',
      task_completion: 'template_task_completion',
      scheduled_reminders: 'template_scheduled_reminder',
      scheduled_report_first: 'template_scheduled_report_first',
      report_submitted: 'template_report_submitted',
    };
    return defaultMappings[emailType] || emailType;
  }
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

    // --- Idempotency: claim a task-level send slot with recipient hash ---
    const claimed = await tryClaimTaskLevelSlot(threadTaskId, recipients, 'task_creation');
    if (!claimed) {
      logger.info(`[TRIGGER DEBUG] Skipping task ${threadTaskId} — duplicate send within dedup window`);
      return;
    }

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

    // Get the template name from mappings
    const templateName = await getTemplateForEmailType('task_creation');

    logger.info(`Creation email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    // Build the full known participant list: creator + all assignees + anyone already in the thread.
    // toRecipients = everyone except the sender so all assignees appear in the To field.
    const allKnown = [
      actualCreatorEmail,
      ...recipients,
      ...(threadInfo?.participants?.split(',').map((p: string) => p.trim()).filter(Boolean) || []),
    ];
    const uniqueKnown = [...new Set(allKnown.map(e => e.toLowerCase()))];
    const toRecipients = uniqueKnown
      .filter(e => e !== actualCreatorEmail.toLowerCase())
      .map(e => allKnown.find(a => a.toLowerCase() === e) || e);

    logger.info(`[TRIGGER DEBUG] Creation email TO recipients: ${toRecipients.join(', ') || 'none'}`);

    // Build comma-separated list of assignee names for template
    const assigneeNames = recipients
      .map(r => usersMap.get(r.trim().toLowerCase()) || r)
      .join(', ');

    // Send ONE email to all recipients
    const result = await sendEmailAsUser(
      actualCreatorEmail,
      toRecipients[0] || recipients[0], // Primary recipient for TO field
      emailSubject,
      '',
      templateName,
      {
        TaskID: task.TaskID,
        Title: task.Title,
        Description: task.Description || task.description || '',
        Priority: task.Priority,
        DueDate: task.DueDate,
        AssignedToEmail: recipients.join(', '), // All assignees
        AssignedToName: assigneeNames, // All assignee names
        AssignedByEmail: actualCreatorEmail,
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
      toRecipients, // All participants in TO field
      'task_creation',
      false
    );

    logger.info(`[TRIGGER DEBUG] Creation email result: success=${result.success}, error=${result.error || 'none'}`);
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

    // --- Idempotency: claim a task-level send slot with recipient hash ---
    // Since we now send ONE consolidated email to all recipients, we need task-level dedup
    // The recipient hash allows legitimate reassignments with different people
    // This prevents duplicate emails when the endpoint is called concurrently
    // (e.g. React StrictMode double-invoke, user double-click, network retry).
    const claimed = await tryClaimTaskLevelSlot(threadTaskId, recipients, 'task_assignment');
    if (!claimed) {
      logger.info(`[TRIGGER DEBUG] Skipping task ${threadTaskId} — duplicate send within dedup window`);
      return;
    }
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

    // Get the template name from mappings
    const templateName = await getTemplateForEmailType('task_assignment');
    const assignedByName = usersMap.get(actualAssignerEmail.trim().toLowerCase()) || actualAssignerEmail;

    logger.info(`Assignment email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}`);

    // All known participants for this task = assigner + all assignees.
    // Email puts everyone except the sender in the TO field so the full thread
    // is visible to all parties regardless of who sends next.
    const allKnown = [
      actualAssignerEmail,
      ...recipients,
      ...(threadInfo?.participants?.split(',').map((p: string) => p.trim()).filter(Boolean) || []),
    ];
    const uniqueKnown = [...new Set(allKnown.map(e => e.toLowerCase()))];

    // Build toRecipients ONCE with all participants except sender
    const toRecipients = uniqueKnown
      .filter(e => e !== actualAssignerEmail.toLowerCase())
      .map(e => allKnown.find(a => a.toLowerCase() === e) || e);

    logger.info(`[TRIGGER DEBUG] TO recipients: ${toRecipients.join(', ') || 'none'}`);

    // Build comma-separated list of assignee names for template
    const assigneeNames = recipients
      .map(r => usersMap.get(r.trim().toLowerCase()) || r)
      .join(', ');

    // Send ONE email to all recipients
    const result = await sendEmailAsUser(
      actualAssignerEmail,
      toRecipients[0] || recipients[0], // Primary recipient for TO field
      emailSubject,
      '',
      templateName,
      {
        TaskID: task.TaskID,
        Title: task.Title,
        Description: task.Description || task.description || '',
        Priority: task.Priority,
        DueDate: task.DueDate,
        AssignedToEmail: recipients.join(', '), // All assignees
        AssignedToName: assigneeNames, // All assignee names
        AssignedByEmail: actualAssignerEmail,
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
      toRecipients, // All participants in TO field
      'task_assignment',
      false
    );

    logger.info(`[TRIGGER DEBUG] Email send result: success=${result.success}, usedFallback=${result.usedFallback}, error=${result.error || 'none'}`);
    if (!result.success && result.error) {
      logger.error(`[TRIGGER ERROR] Failed to send assignment email: ${result.error}`);
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

    // --- Idempotency: claim a task-level send slot with recipient hash ---
    const claimed = await tryClaimTaskLevelSlot(threadTaskId, recipients, 'task_due_soon');
    if (!claimed) {
      logger.info(`[TRIGGER DEBUG] Skipping task ${threadTaskId} — duplicate send within dedup window`);
      return;
    }

    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const threadInfo = await getOrCreateTaskEmailThread(threadTaskId, recipients[0]);

    const usersMap = await loadUsersNameMap();
    const assignedByName = usersMap.get(creatorEmail.trim().toLowerCase()) || creatorEmail;

    // Get the template name from mappings
    const templateName = await getTemplateForEmailType('task_delay');

    logger.info(`Due-soon email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}, template=${templateName}`);

    const allKnown = [
      creatorEmail,
      ...recipients,
      ...(threadInfo?.participants?.split(',').map((p: string) => p.trim()).filter(Boolean) || []),
    ];
    const uniqueKnown = [...new Set(allKnown.map(e => e.toLowerCase()))];

    // Build toRecipients ONCE with all participants except sender
    const toRecipients = uniqueKnown
      .filter(e => e !== creatorEmail.toLowerCase())
      .map(e => allKnown.find(a => a.toLowerCase() === e) || e);

    // Build comma-separated list of assignee names for template
    const assigneeNames = recipients
      .map(r => usersMap.get(r.trim().toLowerCase()) || r)
      .join(', ');

    // Send ONE email to all recipients
    await sendEmailAsUser(
      creatorEmail,
      toRecipients[0] || recipients[0], // Primary recipient for TO field
      emailSubject,
      '',
      templateName,
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
        assigned_to: recipients.join(', '), // All assignees
        AssignedToEmail: recipients.join(', '), // All assignees
        AssignedToName: assigneeNames, // All assignee names
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
      toRecipients, // All participants in TO field
      'task_due_soon',
      false
    );
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

    // --- Idempotency: claim a task-level send slot with recipient hash ---
    const claimed = await tryClaimTaskLevelSlot(threadTaskId, recipients, 'task_overdue');
    if (!claimed) {
      logger.info(`[TRIGGER DEBUG] Skipping task ${threadTaskId} — duplicate send within dedup window`);
      return;
    }

    const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
    const emailSubject = `[${threadTaskId}] ${rootTitle}`;
    const threadInfo = await getOrCreateTaskEmailThread(threadTaskId, recipients[0]);

    const usersMap = await loadUsersNameMap();
    const assignedByName = usersMap.get(creatorEmail.trim().toLowerCase()) || creatorEmail;

    // Get the template name from mappings
    const templateName = await getTemplateForEmailType('task_delay');

    logger.info(`Overdue email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}, template=${templateName}`);

    const allKnown = [
      creatorEmail,
      ...recipients,
      ...(threadInfo?.participants?.split(',').map((p: string) => p.trim()).filter(Boolean) || []),
    ];
    const uniqueKnown = [...new Set(allKnown.map(e => e.toLowerCase()))];

    // Build toRecipients ONCE with all participants except sender
    const toRecipients = uniqueKnown
      .filter(e => e !== creatorEmail.toLowerCase())
      .map(e => allKnown.find(a => a.toLowerCase() === e) || e);

    // Build comma-separated list of assignee names for template
    const assigneeNames = recipients
      .map(r => usersMap.get(r.trim().toLowerCase()) || r)
      .join(', ');

    // Send ONE email to all recipients
    await sendEmailAsUser(
      creatorEmail,
      toRecipients[0] || recipients[0], // Primary recipient for TO field
      emailSubject,
      '',
      templateName,
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
        assigned_to: recipients.join(', '), // All assignees
        AssignedToEmail: recipients.join(', '), // All assignees
        AssignedToName: assigneeNames, // All assignee names
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
      toRecipients, // All participants in TO field
      'task_overdue',
      false
    );
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

    // Get the template name from mappings
    const templateName = await getTemplateForEmailType('report_submitted');

    logger.info(`Report email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}, template=${templateName}`);

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
      templateName,
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
      'report_submission',
      false
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

    // Get the template name from mappings
    const templateName = await getTemplateForEmailType('task_completion');

    logger.info(`Closure email: task=${task.TaskID}, threadTaskId=${threadTaskId}, threadId=${threadInfo?.threadId || 'NEW'}, template=${templateName}`);

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
      templateName,
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
      'task_closure',
      false
    );
  } catch (err) {
    console.error('Task closure email FAILED:', err);
    logger.error('Error triggering task closure email:', err);
  }
}