console.log('[FOLLOWUP REMINDER] Script starting...');

import { firestoreAdmin } from '../services/firebaseAdmin';
import { logger } from '../utils/logger';
import { triggerTaskAssignmentEmail } from '../services/emailTriggerService';
import { getAllUsersCached } from '../routes/firestore';

console.log('[FOLLOWUP REMINDER] All imports loaded successfully');

interface Task {
  TaskID: string;
  Title: string;
  Description: string;
  DueDate: string;
  Priority: string | string[];
  AttachmentLink?: string;
  AssignedToEmail: string;
  AssignedByEmail?: string;
  RequiresFollowUp: string;
  FollowUpCount: number;
  FollowUpReason?: string;
  UpdatedAt: string;
  CreatedAt: string;
}

interface User {
  Email: string;
  FullName: string;
}

/**
 * Get tasks that had follow-ups created yesterday
 */
async function getYesterdayFollowUpTasks(): Promise<Task[]> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const yesterdayStartStr = yesterday.toISOString();
    const yesterdayEndStr = yesterdayEnd.toISOString();

    console.log(`[FOLLOWUP REMINDER] Looking for follow-up tasks between ${yesterdayStartStr} and ${yesterdayEndStr}`);

    // Fetch all tasks with RequiresFollowUp = Yes, then filter by date in JS
    // to avoid needing a composite Firestore index
    const snapshot = await firestoreAdmin
      .collection('tasks')
      .where('RequiresFollowUp', '==', 'Yes')
      .get();

    const allTasks = snapshot.docs.map(doc => doc.data() as Task);
    console.log(`[FOLLOWUP REMINDER] Found ${allTasks.length} total tasks with RequiresFollowUp=Yes`);

    // Filter by date in JavaScript
    const yesterdayTasks = allTasks.filter(task => {
      const updatedAt = new Date(task.UpdatedAt);
      return updatedAt >= yesterday && updatedAt <= yesterdayEnd;
    });

    console.log(`[FOLLOWUP REMINDER] Found ${yesterdayTasks.length} follow-up tasks from yesterday`);

    return yesterdayTasks;
  } catch (err) {
    console.error('[FOLLOWUP REMINDER] Error fetching yesterday follow-up tasks:', err);
    return [];
  }
}

/**
 * Get all users for email resolution
 */
async function getAllUsers(): Promise<User[]> {
  try {
    const users = await getAllUsersCached();
    return users as User[];
  } catch (err) {
    console.error('[FOLLOWUP REMINDER] Error fetching users:', err);
    return [];
  }
}

/**
 * Dry run - just log what would be sent
 */
async function dryRun(tasks: Task[], users: User[]): Promise<void> {
  console.log('[FOLLOWUP REMINDER] === DRY RUN MODE ===');
  console.log('[FOLLOWUP REMINDER] No emails will be sent');
  console.log('[FOLLOWUP REMINDER] ======================');

  for (const task of tasks) {
    const assigner = users.find(u => u.Email === task.AssignedByEmail);
    const assignerName = assigner?.FullName || task.AssignedByEmail || 'Unknown';

    console.log(`[FOLLOWUP REMINDER] Would send email for task ${task.TaskID}:`);
    console.log(`  - Title: ${task.Title}`);
    console.log(`  - Assigned to: ${task.AssignedToEmail}`);
    console.log(`  - Follow-up count: ${task.FollowUpCount}`);
    console.log(`  - Follow-up reason: ${task.FollowUpReason || 'N/A'}`);
    console.log(`  - Last updated: ${task.UpdatedAt}`);
    console.log(`  - Would be sent by: ${assignerName} (${task.AssignedByEmail})`);
    console.log('---');
  }

  console.log(`[FOLLOWUP REMINDER] Total emails that would be sent: ${tasks.length}`);
}

/**
 * Actually send the follow-up reminder emails
 */
async function sendEmails(tasks: Task[], users: User[]): Promise<void> {
  console.log('[FOLLOWUP REMINDER] === SENDING EMAILS ===');

  let successCount = 0;
  let failureCount = 0;

  for (const task of tasks) {
    try {
      // Use the task's AssignedByEmail as the sender, or fall back to the first assignee
      const senderEmail = task.AssignedByEmail || task.AssignedToEmail.split(',')[0].trim();

      if (!senderEmail) {
        console.warn(`[FOLLOWUP REMINDER] Skipping task ${task.TaskID}: no sender email found`);
        failureCount++;
        continue;
      }

      console.log(`[FOLLOWUP REMINDER] Sending email for task ${task.TaskID} to ${task.AssignedToEmail}`);

      await triggerTaskAssignmentEmail(
        senderEmail,
        task.AssignedToEmail,
        task
      );

      successCount++;
      console.log(`[FOLLOWUP REMINDER] Successfully sent email for task ${task.TaskID}`);
    } catch (err) {
      failureCount++;
      console.error(`[FOLLOWUP REMINDER] Failed to send email for task ${task.TaskID}:`, err);
    }
  }

  console.log(`[FOLLOWUP REMINDER] Email sending complete. Success: ${successCount}, Failures: ${failureCount}`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  console.log('[FOLLOWUP REMINDER] Starting follow-up reminder script...');
  console.log(`[FOLLOWUP REMINDER] Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    // Fetch data
    const tasks = await getYesterdayFollowUpTasks();
    const users = await getAllUsers();

    console.log(`[FOLLOWUP REMINDER] Found ${tasks.length} follow-up tasks from yesterday`);
    console.log(`[FOLLOWUP REMINDER] Found ${users.length} users`);

    if (tasks.length === 0) {
      console.log('[FOLLOWUP REMINDER] No follow-up tasks found from yesterday. Exiting.');
      return;
    }

    if (isDryRun) {
      await dryRun(tasks, users);
    } else {
      await sendEmails(tasks, users);
    }

    console.log('[FOLLOWUP REMINDER] Script complete');
  } catch (err) {
    console.error('[FOLLOWUP REMINDER] Script failed:', err);
    process.exit(1);
  }
}

// Run the script
main();

export { main as sendFollowupReminders };
