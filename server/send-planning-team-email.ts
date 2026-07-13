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

const THREAD_DETAILS_FILE = path.join(__dirname, '../data/planning-team-threads.json');

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
 * Send email to planning team leaders with thread persistence
 */
async function sendPlanningTeamEmail() {
  try {
    console.log('=== Planning Team Email Sender ===\n');

    const senderEmail = 'rajeev.1@pw.live';
    const appUrl = process.env.APP_URL || 'https://pms-taskflow-556944241861.us-central1.run.app/';
    const weekOf = '2026-W28';

    // Planning team leaders from team-assignments.csv
    const planningLeaders = [
      { email: 'varun.dhiman@pw.live', name: 'Varun Dhiman', teamId: 'T-PLANNING', teamName: 'Planning' },
      { email: 'kartik.meena@pw.live', name: 'Kartik Meena', teamId: 'T-PLANNING', teamName: 'Planning' }
    ];

    // Load existing thread details
    const threadDetailsMap = loadThreadDetails();

    // Get template
    const template = await getEmailTemplate('template_scheduled_report_first');
    if (!template) {
      console.error('Template template_scheduled_report_first not found');
      return;
    }

    console.log('Step 1: Sending TEST email to lakshay.kumar@pw.live (for verification only)\n');
    console.log('This email will be in a SEPARATE thread from the planning team emails\n');
    
    const testRecipient = 'lakshay.kumar@pw.live';
    const testVars = {
      TeamName: 'Planning',
      day: 'Saturday',
      AppURL: appUrl,
      OfficialWorkMail: testRecipient,
      TemporaryPassword: '123456'
    };

    const testResult = await sendEmailAsUser(
      senderEmail,
      testRecipient,
      template.subject,
      template.body,
      'template_scheduled_report_first',
      testVars,
      undefined, // threadId - first send
      undefined, // messageId - first send
      'TEST-VERIFICATION', // taskId for testing - DIFFERENT from planning team
      'TEST-PLANNING', // teamId for testing - DIFFERENT from planning team
      undefined, // subTeamId
      weekOf,
      'report_reminder'
    );

    console.log(`Test email result: success=${testResult.success}`);
    console.log(`  Thread ID: ${testResult.gmailThreadId}`);
    console.log(`  Message ID: ${testResult.gmailMessageId}`);
    console.log(`  Stored Message ID: ${testResult.storedMessageId}\n`);

    if (!testResult.success) {
      console.error('Test email failed. Aborting.');
      return;
    }

    console.log('Step 2: Sending emails to Planning team leaders\n');
    console.log('All team members will share the SAME thread for this team\n');

    for (const leader of planningLeaders) {
      console.log(`Sending to ${leader.name} (${leader.email})`);

      const threadKey = leader.teamId;
      const existingThread = threadDetailsMap.get(threadKey);

      let threadId: string | undefined;
      let messageId: string | undefined;

      if (existingThread && existingThread.gmailThreadId) {
        threadId = existingThread.gmailThreadId;
        messageId = existingThread.storedMessageId || existingThread.gmailMessageId;
        console.log(`  Existing thread found: Thread ID=${threadId}, Message ID=${messageId}`);
      } else {
        console.log('  No existing thread - this will be first send');
      }

      const templateVars = {
        TeamName: leader.teamName,
        day: 'Saturday',
        AppURL: appUrl,
        OfficialWorkMail: leader.email,
        TemporaryPassword: '123456'
      };

      const result = await sendEmailAsUser(
        senderEmail,
        leader.email,
        template.subject,
        template.body,
        'template_scheduled_report_first',
        templateVars,
        threadId,
        messageId,
        leader.teamId,
        leader.teamId,
        undefined,
        weekOf,
        'report_reminder'
      );

      console.log(`  Result: success=${result.success}`);
      console.log(`  Thread ID: ${result.gmailThreadId}`);
      console.log(`  Message ID: ${result.gmailMessageId}`);
      console.log(`  Stored Message ID: ${result.storedMessageId}\n`);

      // Save thread details for future use (team-based, not person-based)
      if (result.success && result.gmailThreadId && result.gmailMessageId) {
        threadDetailsMap.set(threadKey, {
          teamId: leader.teamId,
          gmailThreadId: result.gmailThreadId,
          gmailMessageId: result.gmailMessageId,
          storedMessageId: result.storedMessageId,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Save all thread details to file
    saveThreadDetails(threadDetailsMap);

    console.log('=== Summary ===');
    console.log('Test email sent to: lakshay.kumar@pw.live');
    console.log('Planning leaders emailed:');
    planningLeaders.forEach(l => console.log(`  - ${l.name} (${l.email})`));
    console.log(`Thread details saved to: ${THREAD_DETAILS_FILE}`);
    console.log('\nYou can now use these thread details to send follow-up emails to the same thread.');

  } catch (error) {
    console.error('Error sending planning team emails:', error);
    process.exit(1);
  }
}

sendPlanningTeamEmail()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
