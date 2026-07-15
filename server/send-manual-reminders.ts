import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';
import { logger } from './utils/logger';
import { sendEmailAsUser } from './services/emailService';
import { getEmailTemplate } from './services/emailTemplateStorage';
import { getTeamReportConfigs } from './services/teamReportConfigService';
import { hasReceivedFirstReportEmail, markFirstReportEmailSent } from './services/userOnboardingService';
import { generateGoogleSheetsToken, fetchSheetValues, appendSheetValues, updateSheetValues } from './services/googleSheetsService';
import { config } from './config';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
type DayOfWeek = typeof DAYS_OF_WEEK[number];

interface TeamWithConfig {
  teamId: string;
  teamName: string;
  reminderDay: DayOfWeek;
  meetingDay: DayOfWeek;
  teamLeaderEmails: string[];
  stakeholderEmails: string[];
}

function getCurrentDayOfWeek(): DayOfWeek {
  const tz = process.env.TZ || 'Asia/Kolkata';
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { timeZone: tz, weekday: 'long' };
  const dayName = new Intl.DateTimeFormat('en-US', options).format(now);
  return dayName as DayOfWeek;
}

function getWeekOfDate(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(3, '0')}`;
}

function getSettingValue(rows: any[][] | null, key: string, defaultValue: string): string {
  if (!rows) return defaultValue;
  const row = rows.find(r => r[0] === key);
  return row && row[1] !== undefined && row[1] !== null ? String(row[1]) : defaultValue;
}

async function saveSettingValue(
  accessToken: string,
  spreadsheetId: string,
  rows: any[][],
  key: string,
  value: string
): Promise<boolean> {
  const index = rows.findIndex(r => r[0] === key);
  let success = false;
  if (index >= 0) {
    const range = `settings!B${index + 1}`;
    success = await updateSheetValues(accessToken, spreadsheetId, range, [[value]]);
    if (success) {
      rows[index][1] = value;
    }
  } else {
    success = await appendSheetValues(accessToken, spreadsheetId, 'settings', [[key, value]]);
    if (success) {
      rows.push([key, value]);
    }
  }
  return success;
}

function getTeamLeaderEmails(settingsRows: any[][], teamId: string): string[] {
  const leaderSettingKey = `team_${teamId}_leaders`;
  const leaderEmailsStr = getSettingValue(settingsRows, leaderSettingKey, '');
  if (!leaderEmailsStr) return [];
  return leaderEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
}

function getTeamStakeholderEmails(settingsRows: any[][], teamId: string): string[] {
  const stakeholderSettingKey = `team_${teamId}_stakeholders`;
  const stakeholderEmailsStr = getSettingValue(settingsRows, stakeholderSettingKey, '');
  if (!stakeholderEmailsStr) return [];
  return stakeholderEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
}

function getSubTeamLeaderEmails(settingsRows: any[][], teamId: string, subTeamId: string): string[] {
  const leaderSettingKey = `team_${teamId}_subteam_${subTeamId}_leaders`;
  const leaderEmailsStr = getSettingValue(settingsRows, leaderSettingKey, '');
  if (!leaderEmailsStr) return [];
  return leaderEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
}

function getTeamRecipients(team: TeamWithConfig): string[] {
  const recipients: string[] = [];
  if (team.teamLeaderEmails) {
    recipients.push(...team.teamLeaderEmails);
  }
  if (team.stakeholderEmails) {
    recipients.push(...team.stakeholderEmails);
  }
  return [...new Set(recipients.map(e => e.toLowerCase()))];
}

async function getOrCreateReportReminderThread(
  teamId: string,
  recipientEmail: string
): Promise<{ threadId?: string; messageId?: string } | null> {
  try {
    const threadDocId = `${teamId}_${recipientEmail}`;
    const threadDoc = await firestoreAdmin.collection('report_reminder_threads').doc(threadDocId).get();

    if (threadDoc.exists) {
      const data = threadDoc.data();
      logger.info(`Found existing report reminder thread for team ${teamId}: threadId=${data?.gmailThreadId}`);
      return {
        threadId: data?.gmailThreadId,
        messageId: data?.gmailMessageId,
      };
    }

    logger.info(`No existing report reminder thread for team ${teamId}, will create after first send`);
    return {};
  } catch (err) {
    logger.error('Error getting or creating report reminder thread:', err);
    return null;
  }
}

async function updateReportReminderThreadId(
  teamId: string,
  recipientEmail: string,
  gmailThreadId: string,
  gmailMessageId: string
): Promise<void> {
  try {
    const threadDocId = `${teamId}_${recipientEmail}`;
    const now = new Date().toISOString();

    await firestoreAdmin.collection('report_reminder_threads').doc(threadDocId).set({
      teamId,
      recipientEmail: recipientEmail.toLowerCase(),
      gmailThreadId,
      gmailMessageId,
      lastSentAt: now,
    }, { merge: true });

    logger.info(`Updated report reminder thread for team ${teamId}: threadId=${gmailThreadId}, messageId=${gmailMessageId}`);
  } catch (err) {
    logger.error('Error updating report reminder threadId:', err);
  }
}

async function sendReportReminder(
  recipientEmail: string,
  team: TeamWithConfig,
  isFirstTime: boolean,
  weekOf: string
): Promise<{ success: boolean; gmailThreadId?: string; gmailMessageId?: string }> {
  try {
    const templateName = isFirstTime ? 'template_scheduled_report_first' : 'template_scheduled_report_reminder';
    const template = await getEmailTemplate(templateName);
    
    if (!template) {
      logger.error(`Template not found: ${templateName}`);
      return { success: false };
    }

    let officialWorkMail = recipientEmail;
    let temporaryPassword = '';
    
    if (isFirstTime) {
      temporaryPassword = '123456';
    }

    const templateVars = {
      TeamName: team.teamName,
      day: team.meetingDay,
      AppURL: config.APP_URL || 'https://pms-taskflow-556944241861.us-central1.run.app/',
      OfficialWorkMail: officialWorkMail,
      TemporaryPassword: temporaryPassword,
    };

    let threadId: string | undefined;
    let messageId: string | undefined;

    if (isFirstTime) {
      logger.info(`First-time onboarding email for ${recipientEmail} - starting fresh thread`);
      threadId = undefined;
      messageId = undefined;
    } else {
      const threadInfo = await getOrCreateReportReminderThread(team.teamId, recipientEmail);
      if (!threadInfo) {
        logger.error(`Failed to get or create thread for team ${team.teamId}`);
        return { success: false };
      }

      if (!threadInfo.threadId) {
        logger.error(`Reminder email for ${recipientEmail} but no existing thread found`);
        threadId = undefined;
        messageId = undefined;
      } else {
        threadId = threadInfo.threadId;
        messageId = threadInfo.messageId;
      }
    }

    const result = await sendEmailAsUser(
      'rajeev.1@pw.live',
      recipientEmail,
      template.subject,
      template.body,
      templateName,
      templateVars,
      threadId,
      messageId,
      team.teamId,
      team.teamId,
      undefined,
      weekOf,
      'report_reminder',
      undefined, // ccEmails
      undefined, // toRecipients
      'manual_report_reminder', // eventType
      true // forceSystemSender - manual script
    );

    if (result.success && result.gmailThreadId && result.gmailMessageId) {
      const finalMessageId = result.storedMessageId || result.gmailMessageId;
      await updateReportReminderThreadId(team.teamId, recipientEmail, result.gmailThreadId, finalMessageId);

      if (isFirstTime) {
        await markFirstReportEmailSent(recipientEmail);
      }
    }

    return result;
  } catch (error) {
    logger.error(`Error sending report reminder to ${recipientEmail}:`, error);
    return { success: false };
  }
}

async function manualSend() {
  try {
    console.log('=== Manually sending report reminder emails for today ===\n');
    console.log('Bypassing time check to send immediately...\n');

    const currentDay = getCurrentDayOfWeek();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    console.log(`Current day: ${currentDay}`);
    console.log(`Date: ${todayStr}\n`);

    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData) {
      logger.error('Failed to generate Google Sheets token');
      return;
    }

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const accessToken = tokenData.accessToken;
    const settingsRows = await fetchSheetValues(accessToken, spreadsheetId, 'settings!A:B');
    
    if (!settingsRows) {
      logger.error('Failed to fetch settings sheet');
      return;
    }

    const lastReportReminderDate = getSettingValue(settingsRows, 'last_report_reminder_date', '');
    const lastReportReminderStatus = getSettingValue(settingsRows, 'last_report_reminder_status', '');
    
    console.log(`Last reminder date: ${lastReportReminderDate}`);
    console.log(`Last reminder status: ${lastReportReminderStatus}\n`);

    // Check if already sent today successfully (duplicate protection)
    if (lastReportReminderDate === todayStr && lastReportReminderStatus === 'success') {
      console.log('⚠️  Report reminders already sent successfully today. Skipping to avoid duplicates.');
      console.log('To force resend, reset the last_report_reminder_status in settings.');
      process.exit(0);
    }

    const configs = await getTeamReportConfigs();
    console.log(`Found ${configs.length} team report configurations\n`);

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

    const entitiesToRemind: TeamWithConfig[] = [];

    for (const config of configs) {
      if (!config.active) continue;
      if (config.reminderDay !== currentDay) continue;

      let teamName: string;
      let leaderEmails: string[] = [];

      if (config.entityType === 'subteam' && config.parentTeamId) {
        const subTeamInfo = subTeamMap.get(config.teamId);
        if (!subTeamInfo) {
          logger.warn(`Sub-team ${config.teamId} not found in Firestore`);
          continue;
        }
        teamName = subTeamInfo.name;
        leaderEmails = getSubTeamLeaderEmails(settingsRows, config.parentTeamId, config.teamId);
      } else {
        teamName = teamMap.get(config.teamId) || config.teamName;
        leaderEmails = getTeamLeaderEmails(settingsRows, config.teamId);
      }

      const stakeholderEmails = config.entityType === 'team' 
        ? getTeamStakeholderEmails(settingsRows, config.teamId)
        : [];

      if (leaderEmails.length === 0 && stakeholderEmails.length === 0) {
        logger.warn(`No leaders or stakeholders configured for ${teamName} (${config.teamId}). Skipping.`);
        continue;
      }

      entitiesToRemind.push({
        teamId: config.teamId,
        teamName,
        reminderDay: config.reminderDay as DayOfWeek,
        meetingDay: config.meetingDay as DayOfWeek,
        teamLeaderEmails: leaderEmails,
        stakeholderEmails: stakeholderEmails,
      });
    }

    console.log(`Sending reminders to ${entitiesToRemind.length} entities\n`);

    const weekOf = getWeekOfDate(new Date());
    console.log(`Week of: ${weekOf}\n`);
    
    let successCount = 0;
    let failureCount = 0;

    for (const entity of entitiesToRemind) {
      const recipients = getTeamRecipients(entity);
      console.log(`Processing ${entity.teamName} (ID: ${entity.teamId}) with ${recipients.length} recipients: ${recipients.join(', ')}`);

      for (const recipient of recipients) {
        const isFirstTime = !(await hasReceivedFirstReportEmail(recipient));
        console.log(`Sending to ${recipient} - First time: ${isFirstTime}`);

        const result = await sendReportReminder(recipient, entity, isFirstTime, weekOf);

        if (result.success) {
          successCount++;
          console.log(`✓ Report reminder sent to ${recipient} for ${entity.teamName}`);
        } else {
          failureCount++;
          console.error(`✗ Failed to send report reminder to ${recipient} for ${entity.teamName}`);

          await firestoreAdmin.collection('report_reminder_failures').add({
            teamId: entity.teamId,
            teamName: entity.teamName,
            recipientEmail: recipient,
            weekOf,
            reason: 'Email send failed',
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    console.log(`\n=== Manual send complete: ${successCount} sent, ${failureCount} failed ===`);

    const finalStatus = failureCount === 0 ? 'success' : 'partial_success';
    await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_report_reminder_date', todayStr);
    await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_report_reminder_status', finalStatus);

  } catch (error) {
    console.error('Error in manual send:', error);
    process.exit(1);
  }
}

manualSend()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
