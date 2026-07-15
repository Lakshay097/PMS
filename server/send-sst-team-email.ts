import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { sendEmailAsUser } from './services/emailService';
import { getEmailTemplate } from './services/emailTemplateStorage';
import { firestoreAdmin } from './services/firebaseAdmin';

interface ThreadDetails {
  teamId: string;
  gmailThreadId?: string;
  gmailMessageId?: string;
  storedMessageId?: string;
  timestamp: string;
}

const THREAD_DETAILS_FILE = path.join(__dirname, '../data/sst-team-threads.json');

/**
 * Load existing thread details from JSON file
 */
function loadThreadDetails(): Map<string, ThreadDetails> {
  try {
    if (fs.existsSync(THREAD_DETAILS_FILE)) {
      const data = fs.readFileSync(THREAD_DETAILS_FILE, 'utf-8');
      const threads = JSON.parse(data) as ThreadDetails[];
      const map = new Map<string, ThreadDetails>();
      threads.forEach(t => map.set(t.teamId, t));
      console.log(`Loaded ${map.size} existing thread details from ${THREAD_DETAILS_FILE}`);
      return map;
    }
  } catch (err) {
    console.error('Error loading thread details:', err);
  }
  return new Map();
}

/**
 * Save thread details to JSON file
 */
function saveThreadDetails(threadsMap: Map<string, ThreadDetails>): void {
  try {
    const threads = Array.from(threadsMap.values());
    fs.writeFileSync(THREAD_DETAILS_FILE, JSON.stringify(threads, null, 2));
    console.log(`Saved ${threads.length} thread details to ${THREAD_DETAILS_FILE}`);
  } catch (err) {
    console.error('Error saving thread details:', err);
  }
}

/**
 * Send email to SST team member with thread persistence
 */
async function sendSSTTeamEmail() {
  try {
    console.log('=== SST Team Email Sender ===\n');

    const senderEmail = 'rajeev.1@pw.live';
    const appUrl = process.env.APP_URL || 'https://pms-taskflow-556944241861.us-central1.run.app/';
    const weekOf = '2026-W28';

    // SST team member
    const sstMember = {
      email: 'atif.khan@finz.club',
      name: 'Atif Khan',
      teamId: 'T-SST',
      teamName: 'SST'
    };

    // Load existing thread details
    const threadDetailsMap = loadThreadDetails();

    // Get template
    const template = await getEmailTemplate('template_scheduled_report_first');
    if (!template) {
      console.error('Template template_scheduled_report_first not found');
      return;
    }

    console.log(`Sending first email to ${sstMember.name} (${sstMember.email}) for ${sstMember.teamName} team\n`);

    const threadKey = sstMember.teamId;
    const existingThread = threadDetailsMap.get(threadKey);

    let threadId: string | undefined;
    let messageId: string | undefined;

    if (existingThread && existingThread.gmailThreadId) {
      threadId = existingThread.gmailThreadId;
      messageId = existingThread.storedMessageId || existingThread.gmailMessageId;
      console.log(`Existing thread found: Thread ID=${threadId}, Message ID=${messageId}`);
    } else {
      console.log('No existing thread - this will be first send');
    }

    const templateVars = {
      TeamName: sstMember.teamName,
      day: 'Saturday',
      AppURL: appUrl,
      OfficialWorkMail: sstMember.email,
      TemporaryPassword: '123456'
    };

    const result = await sendEmailAsUser(
      senderEmail,
      sstMember.email,
      template.subject,
      template.body,
      'template_scheduled_report_first',
      templateVars,
      threadId,
      messageId,
      sstMember.teamId,
      sstMember.teamId,
      undefined,
      weekOf,
      'report_reminder',
      undefined, // ccEmails
      undefined, // toRecipients
      'sst_team', // eventType
      true // forceSystemSender - manual script
    );

    console.log(`\nResult: success=${result.success}`);
    console.log(`Thread ID: ${result.gmailThreadId}`);
    console.log(`Message ID: ${result.gmailMessageId}`);
    console.log(`Stored Message ID: ${result.storedMessageId}\n`);

    // Save thread details for future use (team-based)
    if (result.success && result.gmailThreadId && result.gmailMessageId) {
      threadDetailsMap.set(threadKey, {
        teamId: sstMember.teamId,
        gmailThreadId: result.gmailThreadId,
        gmailMessageId: result.gmailMessageId,
        storedMessageId: result.storedMessageId,
        timestamp: new Date().toISOString()
      });
    }

    // Save all thread details to file
    saveThreadDetails(threadDetailsMap);

    console.log('=== Summary ===');
    console.log(`Email sent to: ${sstMember.name} (${sstMember.email})`);
    console.log(`Team: ${sstMember.teamName} (${sstMember.teamId})`);
    console.log(`Thread details saved to: ${THREAD_DETAILS_FILE}`);
    console.log('\nYou can now use these thread details to send follow-up emails to the same thread.');

  } catch (error) {
    console.error('Error sending SST team email:', error);
    process.exit(1);
  }
}

sendSSTTeamEmail()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
