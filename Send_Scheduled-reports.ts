import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';
import { generateGoogleSheetsToken, fetchSheetValues } from './services/googleSheetsService';
import { getEmailTemplate, replaceTemplateVariables } from './services/emailTemplateStorage';
import { hasReceivedFirstReportEmail, markFirstReportEmailSent } from './services/userOnboardingService';
import { sendEmailAsUser } from './services/emailService';
import { getOrCreateTeamEmailThread, updateTeamEmailThreadId } from './services/emailLogService';

/**
 * USAGE
 *   Dry run (default, sends nothing):
 *     npx tsx sendFilteredTeamEmails.ts --meeting-day=Saturday
 *
 *   Actually send:
 *     npx tsx sendFilteredTeamEmails.ts --meeting-day=Saturday --send
 *
 *   Override "today" for testing which reminderDay bucket gets picked:
 *     npx tsx sendFilteredTeamEmails.ts --meeting-day=Saturday --reminder-day=Monday --send
 *
 *   No --meeting-day means "send to everyone whose reminderDay is today", same as original script.
 */

interface CliArgs {
  meetingDay: string | null;
  reminderDayOverride: string | null;
  isDryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let meetingDay: string | null = null;
  let reminderDayOverride: string | null = null;
  let isDryRun = true; // SAFE DEFAULT: always dry-run unless --send is explicitly passed

  for (const arg of args) {
    if (arg.startsWith('--meeting-day=')) {
      meetingDay = arg.split('=')[1];
    } else if (arg.startsWith('--reminder-day=')) {
      reminderDayOverride = arg.split('=')[1];
    } else if (arg === '--send' || arg === '--live') {
      isDryRun = false;
    } else if (arg === '--dry-run') {
      isDryRun = true;
    }
  }

  return { meetingDay, reminderDayOverride, isDryRun };
}

async function sendFilteredEmails() {
  const { meetingDay: meetingDayFilter, reminderDayOverride, isDryRun } = parseArgs();

  try {
    console.log(isDryRun ? '=== DRY RUN: Team Email Reminder ===\n' : '=== LIVE SEND: Team Email Reminder ===\n');

    const targetDate = new Date();
    const tz = process.env.TZ || 'Asia/Kolkata';
    const options: Intl.DateTimeFormatOptions = { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dayName = reminderDayOverride || new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(targetDate);
    const formattedDate = new Intl.DateTimeFormat('en-US', options).format(targetDate);

    console.log(`Date: ${formattedDate}`);
    console.log(`Reminder-day filter: ${dayName}${reminderDayOverride ? ' (overridden)' : ''}`);
    console.log(`Meeting-day filter: ${meetingDayFilter || '(none — matching any meeting day)'}`);
    console.log(`Mode: ${isDryRun ? 'DRY RUN (no emails will be sent)' : 'LIVE (emails will be sent)'}\n`);

    const configsSnapshot = await firestoreAdmin.collection('team_report_config').get();

    if (configsSnapshot.empty) {
      console.log('No team report configurations found');
      return;
    }

    // Filter configs by reminderDay AND (optionally) meetingDay
    const todaysConfigs: any[] = [];
    configsSnapshot.forEach(doc => {
      const data = doc.data();
      const matchesReminderDay = data.active !== false && data.reminderDay === dayName;
      const matchesMeetingDay = !meetingDayFilter || data.meetingDay === meetingDayFilter;

      if (matchesReminderDay && matchesMeetingDay) {
        todaysConfigs.push({
          teamId: data.teamId,
          teamName: data.teamName,
          reminderDay: data.reminderDay,
          meetingDay: data.meetingDay,
          entityType: data.entityType || 'team',
          parentTeamId: data.parentTeamId,
        });
      }
    });

    if (todaysConfigs.length === 0) {
      console.log(`No teams matched reminderDay="${dayName}"${meetingDayFilter ? ` and meetingDay="${meetingDayFilter}"` : ''}`);
      return;
    }

    console.log(`Matched ${todaysConfigs.length} team config(s):`);
    todaysConfigs.forEach(c => console.log(`  - ${c.teamName || c.teamId} (meetingDay=${c.meetingDay})`));
    console.log('');

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

    function getTeamLeaderEmails(teamId: string): string[] {
      const leaderSettingKey = `team_${teamId}_leaders`;
      const leaderEmailsStr = getSettingValue(leaderSettingKey, '');
      if (!leaderEmailsStr) return [];
      return leaderEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
    }

    function getSubTeamLeaderEmails(teamId: string, subTeamId: string): string[] {
      const leaderSettingKey = `team_${teamId}_subteam_${subTeamId}_leaders`;
      const leaderEmailsStr = getSettingValue(leaderSettingKey, '');
      if (!leaderEmailsStr) return [];
      return leaderEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
    }

    const teamsSnapshot = await firestoreAdmin.collection('teams').get();
    const teamMap = new Map<string, string>();
    teamsSnapshot.forEach(doc => {
      const team = doc.data();
      if (team.Active !== false) {
        teamMap.set(doc.id, team.TeamName);
      }
    });

    const subTeamsSnapshot = await firestoreAdmin.collection('sub_teams').get();
    const subTeamMap = new Map<string, { name: string; parentTeamId: string }>();
    subTeamsSnapshot.forEach(doc => {
      const subTeam = doc.data();
      subTeamMap.set(doc.id, {
        name: subTeam.SubTeamName,
        parentTeamId: subTeam.TeamID,
      });
    });

    console.log('=== SENDER INFO ===');
    console.log(`From: rajeev.1@pw.live`);
    console.log(`Reply-To: rajeev.1@pw.live\n`);

    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;

    for (const cfg of todaysConfigs) {
      let teamName: string;
      let leaderEmails: string[];

      if (cfg.entityType === 'subteam' && cfg.parentTeamId) {
        const subTeamInfo = subTeamMap.get(cfg.teamId);
        if (!subTeamInfo) {
          console.log(`⚠️  Sub-team ${cfg.teamId} not found in Firestore`);
          skippedCount++;
          continue;
        }
        teamName = subTeamInfo.name;
        leaderEmails = getSubTeamLeaderEmails(cfg.parentTeamId, cfg.teamId);
      } else {
        teamName = teamMap.get(cfg.teamId) || cfg.teamName;
        leaderEmails = getTeamLeaderEmails(cfg.teamId);
      }

      if (leaderEmails.length === 0) {
        console.log(`⚠️  No leaders configured for ${teamName}, skipping`);
        skippedCount++;
        continue;
      }

      let anyFirstTime = false;
      for (const leaderEmail of leaderEmails) {
        if (!(await hasReceivedFirstReportEmail(leaderEmail))) {
          anyFirstTime = true;
          break;
        }
      }

      const templateName = anyFirstTime ? 'template_scheduled_report_first' : 'template_scheduled_report_reminder';
      const template = await getEmailTemplate(templateName);

      if (!template) {
        console.log(`⚠️  Template not found: ${templateName}`);
        skippedCount++;
        continue;
      }

      const templateVars = {
        TeamName: teamName,
        day: cfg.meetingDay,
        AppURL: (cfg as any).APP_URL || 'https://pms-taskflow-556944241861.us-central1.run.app/',
        OfficialWorkMail: leaderEmails[0],
        TemporaryPassword: '123456', // Placeholder - should be replaced with actual password
      };

      const subject = replaceTemplateVariables(template.subject, templateVars);
      const body = replaceTemplateVariables(template.body, templateVars);

      console.log(`--- ${isDryRun ? '[DRY RUN] Would send' : 'Sending'} email for ${teamName} ---`);
      console.log(`To: ${leaderEmails[0]}`);
      console.log(`CC: ${leaderEmails.slice(1).join(', ') || 'None'}`);
      console.log(`Subject: ${subject}`);
      console.log(`Template: ${templateName}`);
      console.log(`Meeting day: ${cfg.meetingDay}\n`);

      if (isDryRun) {
        // No Firestore writes, no thread creation, no actual send in dry-run mode
        successCount++;
        console.log('');
        continue;
      }

      // Get or create email thread for this team (only in live mode)
      const threadInfo = await getOrCreateTeamEmailThread(cfg.teamId, leaderEmails[0]);
      const threadId = threadInfo?.threadId || undefined;
      const messageId = threadInfo?.messageId || undefined;

      const result = await sendEmailAsUser(
        'rajeev.1@pw.live', // Sender
        leaderEmails[0], // Primary recipient
        subject,
        body,
        templateName,
        templateVars,
        threadId,
        messageId,
        cfg.teamId,
        cfg.teamId,
        undefined,
        undefined,
        'report_reminder',
        leaderEmails.slice(1) // CC other leaders
      );

      if (result.success) {
        console.log(`✓ Email sent successfully to ${leaderEmails.join(', ')}`);
        successCount++;

        if (result.gmailThreadId && result.gmailMessageId) {
          await updateTeamEmailThreadId(cfg.teamId, result.gmailThreadId, result.gmailMessageId);
        }

        if (anyFirstTime) {
          for (const leaderEmail of leaderEmails) {
            if (!(await hasReceivedFirstReportEmail(leaderEmail))) {
              await markFirstReportEmailSent(leaderEmail);
            }
          }
        }
      } else {
        console.log(`✗ Failed to send email to ${leaderEmails.join(', ')}`);
        console.log(`Error: ${result.error}`);
        failureCount++;
      }

      console.log('');
    }

    console.log('=== SUMMARY ===');
    console.log(`Mode: ${isDryRun ? 'DRY RUN — nothing was actually sent' : 'LIVE'}`);
    console.log(`Total ${isDryRun ? 'would-send' : 'sent'}: ${successCount}`);
    console.log(`Total failures: ${failureCount}`);
    console.log(`Total skipped: ${skippedCount}`);

    if (isDryRun) {
      console.log('\nRun again with --send to actually deliver these emails.');
    }

  } catch (error) {
    console.error('Error sending team emails:', error);
    process.exit(1);
  }
}

sendFilteredEmails()
  .then(() => {
    console.log('\nDone');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nFailed:', error);
    process.exit(1);
  });