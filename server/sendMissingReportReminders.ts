import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// This script is meant to live in the `server/` folder (same level as index.ts),
// with .env one level up at the project root — matching your existing scripts.
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';
import { generateGoogleSheetsToken, fetchSheetValues } from './services/googleSheetsService';
import { getEmailTemplate, replaceTemplateVariables } from './services/emailTemplateStorage';
import { hasReceivedFirstReportEmail, markFirstReportEmailSent } from './services/userOnboardingService';
import { sendEmailAsUser } from './services/emailService';
import { getOrCreateTeamEmailThread, updateTeamEmailThreadId } from './services/emailLogService';
import { getTeamReportConfigs } from './services/teamReportConfigService';
import { config } from './config/env';
import { logger } from './utils/logger';

/**
 * CATCH-UP SCRIPT — sends today's report reminders ONLY to recipients who have
 * NOT already successfully received one today (per the logs). Everyone else is skipped.
 *
 * USAGE:
 *   Dry run (default):  npx tsx sendMissingReportReminders.ts
 *   Actually send:       npx tsx sendMissingReportReminders.ts --send
 *
 * EDIT THE SKIP LIST BELOW before running — it should contain every email
 * that already successfully got today's reminder (confirmed via logs).
 */

// --- Recipients who ALREADY got a successful send today (from your logs) ---
// Edit this if you find more successes you missed.
const ALREADY_SENT_TODAY = new Set<string>([
  'bharat.chaujar@pw.live',
  'priyanshu.mangal@pw.live',
  'varun.kushwaha@pw.live',
  'aman@pw.live',
  'akshay.jain@pw.live',
  'varun.dhiman@pw.live',
  'nikhil.ranjan3@pw.live',
  'rajeev.1@pw.live',
].map(e => e.toLowerCase()));

const isDryRun = !process.argv.includes('--send');
const DELAY_BETWEEN_SENDS_MS = 4000; // slow down to avoid Sheets API rate limiting
const MAX_RETRIES = 2;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getSettingValue(rows: any[][] | null, key: string, defaultValue: string): string {
  if (!rows) return defaultValue;
  const row = rows.find(r => r[0] === key);
  return row && row[1] !== undefined && row[1] !== null ? String(row[1]) : defaultValue;
}

function getTeamLeaderEmails(settingsRows: any[][], teamId: string): string[] {
  const str = getSettingValue(settingsRows, `team_${teamId}_leaders`, '');
  return str ? str.split(',').map(e => e.trim()).filter(Boolean) : [];
}

function getTeamStakeholderEmails(settingsRows: any[][], teamId: string): string[] {
  const str = getSettingValue(settingsRows, `team_${teamId}_stakeholders`, '');
  return str ? str.split(',').map(e => e.trim()).filter(Boolean) : [];
}

function getSubTeamLeaderEmails(settingsRows: any[][], teamId: string, subTeamId: string): string[] {
  const str = getSettingValue(settingsRows, `team_${teamId}_subteam_${subTeamId}_leaders`, '');
  return str ? str.split(',').map(e => e.trim()).filter(Boolean) : [];
}

function getWeekOfDate(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(3, '0')}`;
}

function getCurrentDayOfWeek(): string {
  const tz = process.env.TZ || 'Asia/Kolkata';
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(new Date());
}

async function sendWithRetry(
  recipient: string,
  teamName: string,
  teamId: string,
  meetingDay: string,
  isFirstTime: boolean,
  weekOf: string
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const templateName = isFirstTime ? 'template_scheduled_report_first' : 'template_scheduled_report_reminder';
    const template = await getEmailTemplate(templateName);
    if (!template) {
      logger.error(`Template not found: ${templateName}`);
      return false;
    }

    const templateVars = {
      TeamName: teamName,
      day: meetingDay,
      AppURL: config.APP_URL || 'https://pms-taskflow-556944241861.us-central1.run.app/',
      OfficialWorkMail: recipient,
      TemporaryPassword: isFirstTime ? '123456' : '',
    };

    let threadId: string | undefined;
    let messageId: string | undefined;
    if (!isFirstTime) {
      const threadInfo = await getOrCreateTeamEmailThread(teamId, recipient);
      threadId = threadInfo?.threadId || undefined;
      messageId = threadInfo?.messageId || undefined;
    }

    const senderEmail = process.env.REMINDER_SENDER_EMAIL || config.DEFAULT_FALLBACK_EMAIL;

    const result = await sendEmailAsUser(
      senderEmail,
      recipient,
      template.subject,
      template.body,
      templateName,
      templateVars,
      threadId,
      messageId,
      teamId,
      teamId,
      undefined,
      weekOf,
      'report_reminder',
      undefined,
      undefined,
      'report_reminder',
      false
    );

    if (result.success) {
      if (result.gmailThreadId && result.gmailMessageId) {
        await updateTeamEmailThreadId(teamId, result.gmailThreadId, result.gmailMessageId);
      }
      if (isFirstTime) {
        await markFirstReportEmailSent(recipient);
      }
      return true;
    }

    logger.warn(`Attempt ${attempt}/${MAX_RETRIES} failed for ${recipient} (${teamName}): ${result.error || 'unknown error'}`);
    if (attempt < MAX_RETRIES) {
      await sleep(6000); // longer pause before retry to let token/rate-limit issues clear
    }
  }
  return false;
}

async function main() {
  console.log(isDryRun ? '=== DRY RUN: Catch-up report reminders ===\n' : '=== LIVE SEND: Catch-up report reminders ===\n');
  console.log(`Skipping ${ALREADY_SENT_TODAY.size} recipients who already got today's email.\n`);

  const currentDay = getCurrentDayOfWeek();
  const tokenData = await generateGoogleSheetsToken();
  if (!tokenData) {
    console.error('Failed to generate Google Sheets token');
    return;
  }
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID!;
  const accessToken = tokenData.accessToken;
  const settingsRows = await fetchSheetValues(accessToken, spreadsheetId, 'settings!A:B');
  if (!settingsRows) {
    console.error('Failed to fetch settings sheet');
    return;
  }

  const configs = await getTeamReportConfigs();
  const teamsSnapshot = await firestoreAdmin.collection('teams').get();
  const teamMap = new Map<string, string>();
  teamsSnapshot.forEach(doc => {
    const team = doc.data();
    if (team.Active !== false) teamMap.set(doc.id, team.TeamName);
  });

  const subTeamsSnapshot = await firestoreAdmin.collection('sub_teams').get();
  const subTeamMap = new Map<string, { name: string; parentTeamId: string }>();
  subTeamsSnapshot.forEach(doc => {
    const s = doc.data();
    subTeamMap.set(doc.id, { name: s.SubTeamName, parentTeamId: s.TeamID });
  });

  const weekOf = getWeekOfDate(new Date());
  let sent = 0, failed = 0, skipped = 0;
  const sentThisRun = new Set<string>();

  for (const cfg of configs) {
    if (!cfg.active) continue;
    if (cfg.reminderDay !== currentDay) continue;

    let teamName: string;
    let leaderEmails: string[] = [];

    if (cfg.entityType === 'subteam' && cfg.parentTeamId) {
      const info = subTeamMap.get(cfg.teamId);
      if (!info) continue;
      teamName = info.name;
      leaderEmails = getSubTeamLeaderEmails(settingsRows, cfg.parentTeamId, cfg.teamId);
    } else {
      teamName = teamMap.get(cfg.teamId) || cfg.teamName;
      leaderEmails = getTeamLeaderEmails(settingsRows, cfg.teamId);
    }
    const stakeholderEmails = cfg.entityType === 'team' ? getTeamStakeholderEmails(settingsRows, cfg.teamId) : [];
    const recipients = [...new Set([...leaderEmails, ...stakeholderEmails].map(e => e.toLowerCase()))];

    for (const recipient of recipients) {
      if (ALREADY_SENT_TODAY.has(recipient)) {
        console.log(`⏭  Skip ${recipient} (${teamName}) — already sent today`);
        skipped++;
        continue;
      }
      if (sentThisRun.has(recipient)) {
        console.log(`⏭  Skip ${recipient} (${teamName}) — already sent earlier in this run`);
        continue;
      }

      const isFirstTime = !(await hasReceivedFirstReportEmail(recipient));
      console.log(`${isDryRun ? '[DRY RUN] Would send' : 'Sending'} to ${recipient} for ${teamName} (first-time: ${isFirstTime})`);

      if (isDryRun) {
        sent++;
        continue;
      }

      const ok = await sendWithRetry(recipient, teamName, cfg.teamId, cfg.meetingDay, isFirstTime, weekOf);
      if (ok) {
        console.log(`✓ Sent to ${recipient}`);
        sent++;
        sentThisRun.add(recipient);
      } else {
        console.log(`✗ Failed to send to ${recipient} after ${MAX_RETRIES} attempts`);
        failed++;
      }

      await sleep(DELAY_BETWEEN_SENDS_MS); // pace requests to avoid rate limiting
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Sent: ${sent}, Failed: ${failed}, Skipped (already sent): ${skipped}`);

  if (!isDryRun && failed === 0) {
    // Mark today's run as fully successful so the hourly scheduler doesn't re-fire
    const todayStr = new Date().toISOString().split('T')[0];
    await firestoreAdmin.collection('scheduler_locks').doc('report_reminder').set({
      lastRunDate: todayStr,
      lastRunStatus: 'success',
      lastRunTimestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    console.log('Marked scheduler lock as success for today — hourly scheduler will not resend.');
  } else if (!isDryRun) {
    console.log('Some sends still failed — NOT marking lock as success. Re-run this script after investigating.');
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });   