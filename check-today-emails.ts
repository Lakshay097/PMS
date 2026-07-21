import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import { generateGoogleSheetsToken, fetchSheetValues } from './server/services/googleSheetsService';

async function checkTodayEmails() {
  try {
    console.log('=== Today\'s Email Log Check ===\n');

    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      console.error('Failed to get Google Sheets token');
      return;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const accessToken = tokenData.accessToken;
    
    // Fetch email logs
    const emailLogs = await fetchSheetValues(accessToken, spreadsheetId, 'email_logs!A:F');
    
    if (!emailLogs || emailLogs.length <= 1) {
      console.log('No email logs found');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    console.log(`Today's date: ${todayStr}\n`);

    // Filter today's emails
    const todayEmails = emailLogs.slice(1).filter(row => {
      const timestamp = row[0];
      return timestamp && timestamp.startsWith(todayStr);
    });

    if (todayEmails.length === 0) {
      console.log('No emails sent today');
      return;
    }

    console.log(`=== Emails sent today (${todayEmails.length}) ===\n`);

    // Group by subject/thread
    const emailGroups = new Map<string, any[]>();
    
    for (const row of todayEmails) {
      const timestamp = row[0];
      const sender = row[1];
      const recipient = row[2];
      const subject = row[3];
      const status = row[4];
      const error = row[5];

      if (!emailGroups.has(subject)) {
        emailGroups.set(subject, []);
      }
      emailGroups.get(subject)!.push({ timestamp, sender, recipient, subject, status, error });
    }

    // Display grouped emails
    for (const [subject, emails] of emailGroups) {
      console.log(`Subject: ${subject}`);
      console.log(`  Total recipients: ${emails.length}`);
      
      const successful = emails.filter(e => e.status === 'sent');
      const failed = emails.filter(e => e.status === 'failed');
      
      console.log(`  Successful: ${successful.length}`);
      console.log(`  Failed: ${failed.length}`);
      
      console.log(`  Recipients:`);
      for (const email of emails) {
        const statusIcon = email.status === 'sent' ? '✓' : '✗';
        console.log(`    ${statusIcon} ${email.recipient} (${email.status})`);
        if (email.error) {
          console.log(`       Error: ${email.error}`);
        }
      }
      console.log('');
    }

    console.log('=== Summary ===');
    console.log(`Total emails sent today: ${todayEmails.length}`);
    console.log(`Successful: ${todayEmails.filter(e => e.status === 'sent').length}`);
    console.log(`Failed: ${todayEmails.filter(e => e.status === 'failed').length}`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTodayEmails();
