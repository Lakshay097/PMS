import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';

/**
 * Clears test thread state for a specific team+recipient pair.
 * Used to ensure clean first-contact scenario testing.
 */
async function clearTestThreadState(teamId: string, recipientEmail: string): Promise<void> {
  try {
    const threadDocId = `${teamId}_${recipientEmail}`;
    await firestoreAdmin.collection('report_reminder_threads').doc(threadDocId).delete();
    console.log(`Cleared thread state for ${threadDocId}`);
  } catch (err) {
    console.error(`Error clearing thread state:`, err);
  }
}

// Inline Google Sheets functions
async function generateGoogleSheetsToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.trim();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID?.trim();

  if (!email || !privateKey) {
    console.error("Google Service Account credentials not provided in environment.");
    return null;
  }

  const formattedKey = privateKey.replace(/\\n/g, "\n");
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const claims = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp,
    iat
  };

  const header = { alg: "RS256", typ: "JWT" };
  const base64UrlHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const base64UrlPayload = Buffer.from(JSON.stringify(claims)).toString("base64url");

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${base64UrlHeader}.${base64UrlPayload}`);
  const signature = sign.sign(formattedKey).toString("base64url");

  const jwt = `${base64UrlHeader}.${base64UrlPayload}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    console.error(`Google SA Token fetch failed (HTTP ${tokenRes.status}):`, errorText);
    return null;
  }

  const tokenData = await tokenRes.json();
  return {
    accessToken: tokenData.access_token,
    spreadsheetId: spreadsheetId || null,
    expiresIn: tokenData.expires_in,
    serviceAccountActive: true
  };
}

async function fetchSheetValues(accessToken: string, spreadsheetId: string, range: string) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    console.error(`Failed to fetch sheet range ${range}:`, await res.text());
    return null;
  }

  const data = await res.json();
  return data.values || [];
}

async function testPersistentThreading() {
  try {
    console.log('=== Testing Persistent Email Threading with New Templates ===\n');
    console.log('NOTE: All test emails will be sent to lakshay.kumar@pw.live only\n');
    console.log('Sender: rajeev.1@pw.live\n');
    console.log('TESTING ONLY EXPANSION TEAM TO ISOLATE THREADING ISSUE\n');

    // Clear test thread state for clean first-contact scenario
    await clearTestThreadState('T-263', 'lakshay.kumar@pw.live');
    console.log('');

    const { sendEmailAsUser } = await import('./services/emailService');
    const { getEmailTemplate } = await import('./services/emailTemplateStorage');

    const weekOf = '2026-W28'; // Current week
    const testRecipient = 'lakshay.kumar@pw.live';
    const senderEmail = 'rajeev.1@pw.live'; // Production sender

    // Test 1: Team-level entity (Expansion) - First email (with credentials)
    console.log('Test 1: Sending FIRST scheduled report (Expansion team context - with credentials)');
    console.log('Team: Expansion (T-263)');
    console.log('Actual recipient: lakshay.kumar@pw.live (testing only)\n');
    
    const expansionThreadKey = 'T-263_lakshay.kumar@pw.live';
    const expansionThreadDoc = await firestoreAdmin.collection('report_reminder_threads').doc(expansionThreadKey).get();
    
    let expansionThreadId: string | undefined;
    let expansionMessageId: string | undefined;
    
    if (expansionThreadDoc.exists) {
      const data = expansionThreadDoc.data();
      expansionThreadId = data?.gmailThreadId;
      expansionMessageId = data?.gmailMessageId;
      console.log('Existing thread found:');
      console.log(`  Thread ID: ${expansionThreadId}`);
      console.log(`  Message ID: ${expansionMessageId}`);
    } else {
      console.log('No existing thread - this will be first send');
    }

    const firstTemplate = await getEmailTemplate('template_scheduled_report_first');
    if (!firstTemplate) {
      console.error('First template not found');
      return;
    }

    const expansionVars = {
      TeamName: 'Expansion',
      day: 'Saturday',
      AppURL: 'https://pms-taskflow-556944241861.us-central1.run.app/',
      OfficialWorkMail: testRecipient,
      TemporaryPassword: '123456'
    };

    const expansionResult1 = await sendEmailAsUser(
      senderEmail,
      testRecipient,
      firstTemplate.subject,
      firstTemplate.body,
      'template_scheduled_report_first',
      expansionVars,
      expansionThreadId,
      expansionMessageId,
      'T-263', // taskId - use teamId for thread persistence
      'T-263',
      undefined, // subTeamId
      weekOf,
      'report_reminder'
    );

    console.log(`First email result: success=${expansionResult1.success}, threadId=${expansionResult1.gmailThreadId}, messageId=${expansionResult1.gmailMessageId}, storedMessageId=${expansionResult1.storedMessageId}\n`);

    // Wait 2 seconds before second email
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 1b: Second email to same recipient (reminder, no credentials)
    console.log('Test 1b: Sending SECOND scheduled report (Expansion team context - reminder, no credentials)');
    
    const reminderTemplate = await getEmailTemplate('template_scheduled_report_reminder');
    if (!reminderTemplate) {
      console.error('Reminder template not found');
      return;
    }

    const expansionResult2 = await sendEmailAsUser(
      senderEmail,
      testRecipient,
      reminderTemplate.subject,
      reminderTemplate.body,
      'template_scheduled_report_reminder',
      expansionVars,
      expansionResult1.gmailThreadId,
      expansionResult1.storedMessageId || expansionResult1.gmailMessageId, // Use Gmail-stored Message-ID
      'T-263', // taskId - use teamId for thread persistence
      'T-263',
      undefined, // subTeamId
      weekOf,
      'report_reminder'
    );

    console.log(`Second email result: success=${expansionResult2.success}, threadId=${expansionResult2.gmailThreadId}, messageId=${expansionResult2.gmailMessageId}`);
    console.log(`Thread ID match: ${expansionResult1.gmailThreadId === expansionResult2.gmailThreadId ? '✅' : '❌'}\n`);

    console.log('=== Verification Complete ===');
    console.log('Summary:');
    console.log(`  Expansion (team context): Thread ID = ${expansionResult2.gmailThreadId}`);
    console.log(`  Both emails should be in the SAME thread in Gmail`);
    console.log('\nAll emails sent to: lakshay.kumar@pw.live');
    console.log('Sender: rajeev.1@pw.live');
    console.log('Templates used: template_scheduled_report_first (with credentials), template_scheduled_report_reminder (no credentials)');
    console.log('Please check Gmail to verify threading and template content.');

  } catch (error) {
    console.error('Error testing persistent threading:', error);
    process.exit(1);
  }
}

testPersistentThreading()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
