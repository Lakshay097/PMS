import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { generateGoogleSheetsToken, fetchSheetValues } from './services/googleSheetsService';

async function checkSchedulerStatus() {
  try {
    console.log('=== Checking Scheduler Status ===\n');

    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      console.error('Failed to get Google Sheets token');
      return;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const accessToken = tokenData.accessToken;
    const settingsRows = await fetchSheetValues(accessToken, spreadsheetId, 'settings!A:B');
    
    if (!settingsRows) {
      console.error('Failed to fetch settings sheet');
      return;
    }

    function getSettingValue(key: string, defaultValue: string): string {
      const row = settingsRows.find(r => r[0] === key);
      return row && row[1] !== undefined && row[1] !== null ? String(row[1]) : defaultValue;
    }

    const lastReportReminderDate = getSettingValue('last_report_reminder_date', 'N/A');
    const lastReportReminderStatus = getSettingValue('last_report_reminder_status', 'N/A');
    
    console.log('Report Reminder Scheduler Status:');
    console.log(`  Last run date: ${lastReportReminderDate}`);
    console.log(`  Last run status: ${lastReportReminderStatus}`);
    console.log('');

    const todayStr = new Date().toISOString().split('T')[0];
    console.log(`Today's date: ${todayStr}`);
    console.log(`Match: ${lastReportReminderDate === todayStr ? 'YES' : 'NO'}`);
    console.log('');

    // Check current time in configured timezone
    const tz = process.env.TZ || 'Asia/Kolkata';
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'long'
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    const result: Record<string, string> = {};
    parts.forEach(p => { result[p.type] = p.value });
    
    console.log(`Current time (${tz}): ${result.weekday}, ${result.hour}:${result.minute}`);
    console.log('');

    // Analyze the issue
    console.log('=== Root Cause Analysis ===');
    console.log('The scheduler has a HARD TIME CHECK at exactly 9:30 AM IST.');
    console.log('If the server was not running at exactly 9:30 AM, or if there was any');
    console.log('delay, the check would fail and no emails would be sent.');
    console.log('');
    console.log('The scheduler runs every hour, but the function itself checks:');
    console.log('  if (timeInfo.hour !== 9 || timeInfo.minute !== 30)');
    console.log('This means it ONLY runs at 9:30 AM, not at any other time.');
    console.log('');
    console.log('=== Recommended Fix ===');
    console.log('Change the time check to run any time AFTER 9:30 AM on the scheduled day,');
    console.log('not exactly at 9:30 AM. This would make the scheduler more robust.');

  } catch (error) {
    console.error('Error checking scheduler status:', error);
    process.exit(1);
  }
}

checkSchedulerStatus()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
