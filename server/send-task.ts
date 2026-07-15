import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';
import { getEmailTemplate, replaceTemplateVariables } from './services/emailTemplateStorage';
import { sendEmailAsUser } from './services/emailService';
import { getOrCreateTaskEmailThread, updateTaskEmailThreadId } from './services/emailLogService';

// --- Dry run flag ---
// Run with: DRY_RUN=true npx tsx sendTSK7540Email.ts
const DRY_RUN = process.env.DRY_RUN === 'true';

// --- Sanity check: refresh token must be present in .env, never hardcoded here ---
if (!process.env.GMAIL_REFRESH_TOKEN) {
  console.error('✗ Missing GMAIL_REFRESH_TOKEN in .env. Aborting.');
  process.exit(1);
}

async function sendTSK7540Email() {
  try {
    console.log(`=== SENDING EMAIL FOR TSK-7540 ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

    // Fetch task details
    const taskQuery = await firestoreAdmin.collection('tasks').where('TaskID', '==', 'TSK-7540').get();

    if (taskQuery.empty) {
      console.log('Task TSK-7540 not found');
      return;
    }

    const task = taskQuery.docs[0].data();

    // Get email details
    const creatorEmail = task.CreatedByEmail || task.AssignedByEmail || 'utsav@pw.live';
    const assignedToEmails = task.AssignedToEmail || task.AssignedTo || '';
    const recipients = assignedToEmails.split(',').map((e: string) => e.trim()).filter(Boolean);

    if (recipients.length === 0) {
      console.log('No recipients found for this task');
      return;
    }

    const primaryRecipient = recipients[0];
    const ccRecipients = recipients.slice(1);

    console.log('--- EMAIL DETAILS ---');
    console.log(`Task: ${task.TaskID}`);
    console.log(`Sender: ${creatorEmail}`);
    console.log(`Primary Recipient: ${primaryRecipient}`);
    console.log(`CC Recipients: ${ccRecipients.join(', ') || 'None'}`);
    console.log('');

    // Get email template
    const template = await getEmailTemplate('template_task_creation');

    if (!template) {
      console.log('Template not found: template_task_creation');
      return;
    }

    // Prepare template variables
    const templateVars = {
      TaskID: task.TaskID,
      Title: task.Title,
      Description: task.Description || '',
      Priority: task.Priority,
      DueDate: task.DueDate,
      AssignedToEmail: assignedToEmails,
      AssignedToName: primaryRecipient,
      AssignedByEmail: creatorEmail,
      AssignedByName: creatorEmail,
      AttachmentLink: task.AttachmentLink || 'No attachment',
      AppURL: process.env.APP_URL || 'http://localhost:3000'
    };

    const subject = replaceTemplateVariables(template.subject, templateVars);
    const body = replaceTemplateVariables(template.body, templateVars);

    console.log('--- RENDERED EMAIL ---');
    console.log(`Subject: ${subject}\n`);
    console.log(`Body:\n${body}\n`);

    if (DRY_RUN) {
      // Fully side-effect-free: skip thread lookup/creation and any sends
      console.log('🟡 DRY RUN — no thread lookup, no email sent, no Firestore writes.');
      console.log(`Would send to: ${primaryRecipient}`);
      console.log(`Would CC: ${ccRecipients.join(', ') || 'None'}`);
      return;
    }

    // Get or create email thread for this task (only runs on real send)
    const threadInfo = await getOrCreateTaskEmailThread(task.TaskID, primaryRecipient);

    console.log('--- SENDING EMAIL ---');

    // Send email
    // NOTE: assumes sendEmailAsUser reads Gmail OAuth credentials internally
    // via process.env.GMAIL_REFRESH_TOKEN / GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET.
    // If it instead expects a client/token passed in, this call needs updating —
    // share the function signature and I'll adjust it.
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

        console.log('✓ Thread info updated in both Google Sheets and Firestore');
      }
    } else {
      console.log(`✗ Failed to send email`);
      console.log(`Error: ${result.error}`);
    }

  } catch (error) {
    console.error('Error sending email:', error);
    process.exit(1);
  }
}

sendTSK7540Email()
  .then(() => {
    console.log(`\nEmail sending ${DRY_RUN ? 'dry run' : 'completed'}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nEmail sending failed:', error);
    process.exit(1);
  });