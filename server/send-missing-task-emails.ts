import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';
import { getEmailTemplate, replaceTemplateVariables } from './services/emailTemplateStorage';
import { generateGoogleSheetsToken, fetchSheetValues } from './services/googleSheetsService';
import { sendEmailAsUser } from './services/emailService';
import { getOrCreateTaskEmailThread, updateTaskEmailThreadId } from './services/emailLogService';

// --- Dry run flag ---
// Run with: DRY_RUN=true npx tsx send-missing-task-emails.ts
const DRY_RUN = process.env.DRY_RUN === 'true';

async function sendMissingTaskEmails() {
  try {
    console.log(`=== SENDING EMAILS FOR TASKS WITHOUT EMAILS ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

    // Fetch all tasks from Firestore
    const tasksSnapshot = await firestoreAdmin.collection('tasks').get();
    
    console.log(`Total tasks in database: ${tasksSnapshot.size}\n`);

    // Fetch email logs from Google Sheets
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      console.error('Failed to get Google Sheets token');
      return;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const accessToken = tokenData.accessToken;
    
    // Fetch email logs
    let emailLogs: any[][] = [];
    try {
      emailLogs = await fetchSheetValues(accessToken, spreadsheetId, 'email_logs!A:F');
      console.log(`Email logs found: ${emailLogs ? emailLogs.length : 0} entries\n`);
    } catch (err) {
      console.log('No email_logs sheet found or error fetching logs\n');
    }

    // Fetch users from Google Sheets for name resolution
    const usersData = await fetchSheetValues(
      accessToken,
      spreadsheetId,
      'users!A:Z'
    );

    const usersMap = new Map<string, string>();
    if (usersData && usersData.length > 1) {
      for (let i = 1; i < usersData.length; i++) {
        const row = usersData[i];
        const email = row[2]?.trim().toLowerCase();
        const fullName = row[1]?.trim();
        if (email && fullName) {
          usersMap.set(email, fullName);
        }
      }
    }

    const tasksWithoutEmails: any[] = [];

    // Check each task for email logs
    tasksSnapshot.forEach(doc => {
      const task = doc.data();
      const taskId = task.TaskID;
      const taskTitle = task.Title;
      
      let emailFound = false;
      if (emailLogs && emailLogs.length > 1) {
        for (let i = 1; i < emailLogs.length; i++) {
          const log = emailLogs[i];
          const subject = log[3] || '';
          // Check if subject contains the task title and is a task creation email
          // Matches patterns like: "New task created for you: [Medium] Title", "[TSK-1234] Title", etc.
          if (subject.includes(taskTitle) && (subject.includes('New task') || subject.includes('task created'))) {
            emailFound = true;
            break;
          }
        }
      }

      if (!emailFound) {
        tasksWithoutEmails.push(task);
      }
    });

    console.log(`Tasks without task creation emails: ${tasksWithoutEmails.length}\n`);

    if (tasksWithoutEmails.length === 0) {
      console.log('All tasks have task creation emails sent');
      return;
    }

    // Show what would be sent
    console.log('=== TASKS THAT WOULD RECEIVE EMAILS ===\n');
    for (const task of tasksWithoutEmails) {
      const creatorEmail = task.CreatedByEmail || 'rajeev.1@pw.live';
      const creatorName = usersMap.get(creatorEmail.toLowerCase()) || creatorEmail;
      const assignedToEmails = task.AssignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);

      if (assignedToEmails.length === 0) {
        console.log(`⚠️  Task ${task.TaskID}: ${task.Title} - NO ASSIGNEES, will skip`);
        continue;
      }

      const primaryRecipient = assignedToEmails[0];
      const ccRecipients = assignedToEmails.slice(1);
      const primaryRecipientName = usersMap.get(primaryRecipient.toLowerCase()) || primaryRecipient;
      
      const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
      const emailSubject = `[${task.TaskID}] ${rootTitle}`;

      console.log(`📧 Task ${task.TaskID}: ${task.Title}`);
      console.log(`   From: ${creatorEmail} (${creatorName})`);
      console.log(`   To: ${primaryRecipient} (${primaryRecipientName})`);
      console.log(`   CC: ${ccRecipients.join(', ') || 'None'}`);
      console.log(`   Subject: ${emailSubject}`);
      console.log('');
    }

    if (DRY_RUN) {
      console.log('🟡 DRY RUN — No emails were sent. To send actual emails, run without DRY_RUN=true');
      console.log(`   Command: npx tsx send-missing-task-emails.ts`);
      return;
    }

    console.log('=== SENDING ACTUAL EMAILS ===\n');
    
    let successCount = 0;
    let failureCount = 0;

    // Send emails for tasks without emails
    for (const task of tasksWithoutEmails) {
      const creatorEmail = task.CreatedByEmail || 'rajeev.1@pw.live';
      const creatorName = usersMap.get(creatorEmail.toLowerCase()) || creatorEmail;
      const assignedToEmails = task.AssignedToEmail.split(',').map((e: string) => e.trim()).filter(Boolean);

      if (assignedToEmails.length === 0) {
        console.log(`⚠️  Task ${task.TaskID} has no assignees, skipping`);
        continue;
      }

      const template = await getEmailTemplate('template_task_creation');
      if (!template) {
        console.log(`⚠️  Template not found: template_task_creation`);
        continue;
      }

      // One email per task with all assignees CC'd
      const primaryRecipient = assignedToEmails[0];
      const ccRecipients = assignedToEmails.slice(1);
      const primaryRecipientName = usersMap.get(primaryRecipient.toLowerCase()) || primaryRecipient;
      
      const rootTitle = task.Title.replace(/^Follow-up #\d+:\s*/i, '');
      const emailSubject = `[${task.TaskID}] ${rootTitle}`;

      const templateVars = {
        TaskID: task.TaskID,
        Title: task.Title,
        Description: task.Description || '',
        Priority: task.Priority,
        DueDate: task.DueDate,
        AssignedToEmail: assignedToEmails.join(', '),
        AssignedToName: primaryRecipientName,
        AssignedByEmail: creatorEmail,
        AssignedByName: creatorName,
        AttachmentLink: task.AttachmentLink || 'No attachment',
      };

      const subject = replaceTemplateVariables(template.subject, templateVars);
      const body = replaceTemplateVariables(template.body, templateVars);

      // Get or create email thread for this task
      const threadInfo = await getOrCreateTaskEmailThread(task.TaskID, primaryRecipient);

      console.log(`--- Sending email for task ${task.TaskID} ---`);
      console.log(`From: ${creatorEmail}`);
      console.log(`To: ${primaryRecipient}`);
      console.log(`CC: ${ccRecipients.join(', ') || 'None'}`);
      console.log(`Subject: ${subject}\n`);

      // Send email
      const result = await sendEmailAsUser(
        creatorEmail,
        primaryRecipient,
        subject,
        body,
        'template_task_creation',
        templateVars,
        threadInfo?.threadId,
        threadInfo?.messageId,
        task.TaskID,
        undefined, // teamId
        undefined, // subTeamId
        undefined, // weekOf
        undefined, // emailType
        ccRecipients, // ccEmails
        undefined, // toRecipients
        'task_creation', // eventType
        false // forceSystemSender
      );

      if (result.success) {
        console.log(`✓ Email sent successfully to ${primaryRecipient}${ccRecipients.length > 0 ? ' (CC: ' + ccRecipients.join(', ') + ')' : ''}`);
        successCount++;

        // Update thread info after successful send (both Google Sheets and Firestore)
        if (result.gmailThreadId && result.gmailMessageId) {
          await updateTaskEmailThreadId(task.TaskID, result.gmailThreadId, result.gmailMessageId);
          
          // Also store in Firestore as backup for duplicate checking
          await firestoreAdmin.collection('task_email_threads').doc(`${task.TaskID}_${primaryRecipient}`).set({
            taskId: task.TaskID,
            recipientEmail: primaryRecipient,
            gmailThreadId: result.gmailThreadId,
            gmailMessageId: result.gmailMessageId,
            participants: [primaryRecipient, ...ccRecipients].join(','),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      } else {
        console.log(`✗ Failed to send email to ${primaryRecipient}`);
        console.log(`Error: ${result.error}`);
        failureCount++;
      }

      console.log('');
    }

    console.log('=== SUMMARY ===');
    console.log(`Total emails sent: ${successCount}`);
    console.log(`Total failures: ${failureCount}`);

  } catch (error) {
    console.error('Error sending task creation emails:', error);
    process.exit(1);
  }
}

sendMissingTaskEmails()
  .then(() => {
    console.log(`\nEmail sending ${DRY_RUN ? 'dry run' : 'completed'}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nEmail sending failed:', error);
    process.exit(1);
  });
