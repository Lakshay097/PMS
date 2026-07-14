import { firestoreAdmin } from './firebaseAdmin';
import { logger } from '../utils/logger';
import { sendEmailAsUser } from './emailService';
import { getEmailTemplate } from './emailTemplateStorage';
import { getTeamReportConfigs } from './teamReportConfigService';
import { hasReceivedFirstReportEmail, markFirstReportEmailSent } from './userOnboardingService';

/**
 * Gets or creates a report reminder email thread.
 * Similar to getOrCreateTaskEmailThread but uses Firestore instead of Google Sheets.
 */
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

    // No existing thread - return empty object (will be created after first send)
    logger.info(`No existing report reminder thread for team ${teamId}, will create after first send`);
    return {};
  } catch (err) {
    logger.error('Error getting or creating report reminder thread:', err);
    return null;
  }
}

/**
 * Updates the report reminder thread info after successful send.
 * Called after every successful send so thread info stays current for reply chaining.
 */
export async function updateReportReminderThreadId(
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

import { config } from '../config';
import { generateGoogleSheetsToken, fetchSheetValues } from './googleSheetsService';

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

/**
 * Get the current day of week in the configured timezone
 */
function getCurrentDayOfWeek(): DayOfWeek {
  const tz = process.env.TZ || 'Asia/Kolkata';
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { timeZone: tz, weekday: 'long' };
  const dayName = new Intl.DateTimeFormat('en-US', options).format(now);
  return dayName as DayOfWeek;
}

/**
 * Get current time info in the configured timezone
 */
function getCurrentTimeInfo(): { hour: number; minute: number } {
  const tz = process.env.TZ || 'Asia/Kolkata';
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(now);
  const result: Record<string, string> = {};
  parts.forEach(p => { result[p.type] = p.value });
  
  return {
    hour: parseInt(result.hour || '0'),
    minute: parseInt(result.minute || '0')
  };
}

/**
 * Helper to query settings from Google Sheets
 */
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
  const { updateSheetValues, appendSheetValues } = await import('./googleSheetsService');
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

/**
 * Get team leader emails from settings sheet
 */
function getTeamLeaderEmails(settingsRows: any[][], teamId: string): string[] {
  const leaderSettingKey = `team_${teamId}_leaders`;
  const leaderEmailsStr = getSettingValue(settingsRows, leaderSettingKey, '');
  if (!leaderEmailsStr) return [];
  return leaderEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
}

/**
 * Get team stakeholder emails from settings sheet
 */
function getTeamStakeholderEmails(settingsRows: any[][], teamId: string): string[] {
  const stakeholderSettingKey = `team_${teamId}_stakeholders`;
  const stakeholderEmailsStr = getSettingValue(settingsRows, stakeholderSettingKey, '');
  if (!stakeholderEmailsStr) return [];
  return stakeholderEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
}

/**
 * Get sub-team leader emails from settings sheet
 */
function getSubTeamLeaderEmails(settingsRows: any[][], teamId: string, subTeamId: string): string[] {
  const leaderSettingKey = `team_${teamId}_subteam_${subTeamId}_leaders`;
  const leaderEmailsStr = getSettingValue(settingsRows, leaderSettingKey, '');
  if (!leaderEmailsStr) return [];
  return leaderEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
}

/**
 * Get week of date in ISO format (YYYY-Www)
 */
function getWeekOfDate(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(3, '0')}`;
}

/**
 * Check if a team has valid recipients (team leaders or stakeholders)
 */
function hasValidRecipients(team: TeamWithConfig): boolean {
  return (team.teamLeaderEmails && team.teamLeaderEmails.length > 0) ||
         (team.stakeholderEmails && team.stakeholderEmails.length > 0);
}

/**
 * Get all recipients for a team (leaders + stakeholders)
 */
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

/**
 * Send report reminder email to a recipient
 */
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

    // Get user record for credentials if first time
    let officialWorkMail = recipientEmail;
    let temporaryPassword = '';
    
    if (isFirstTime) {
      // In a real implementation, you'd fetch the user's actual password
      // For now, we'll use a placeholder
      temporaryPassword = '123456';
    }

    const templateVars = {
      TeamName: team.teamName,
      day: team.meetingDay,
      AppURL: config.APP_URL || 'https://pms-taskflow-556944241861.us-central1.run.app/',
      OfficialWorkMail: officialWorkMail,
      TemporaryPassword: temporaryPassword,
    };

    // Check for existing thread - use persistent thread key (teamId only, not week-specific)
    // CRITICAL: If this is the first-time onboarding email, ALWAYS start a fresh thread
    // regardless of whether a thread exists from previous test runs or errors.
    // Only use existing thread for reminder emails (isFirstTime = false).
    let threadId: string | undefined;
    let messageId: string | undefined;

    if (isFirstTime) {
      // Onboarding email: always start fresh thread, never reply to existing thread
      logger.info(`First-time onboarding email for ${recipientEmail} - starting fresh thread`);
      threadId = undefined;
      messageId = undefined;
    } else {
      // Reminder email: must reply to existing thread
      const threadInfo = await getOrCreateReportReminderThread(team.teamId, recipientEmail);
      if (!threadInfo) {
        logger.error(`Failed to get or create thread for team ${team.teamId}`);
        return { success: false };
      }

      if (!threadInfo.threadId) {
        // BUG: Reminder email sent without existing thread - this shouldn't happen
        // if onboarding status tracking is working correctly
        logger.error(`Reminder email for ${recipientEmail} but no existing thread found - onboarding may not have been sent`);
        // For now, we'll allow it to start a new thread, but this should be investigated
        threadId = undefined;
        messageId = undefined;
      } else {
        threadId = threadInfo.threadId;
        messageId = threadInfo.messageId;
      }
    }

    const result = await sendEmailAsUser(
      'rajeev.1@pw.live', // Fixed sender for scheduled reports
      recipientEmail,
      template.subject,
      template.body,
      templateName,
      templateVars,
      threadId, // Gmail threadId for API
      messageId, // RFC Message-ID for In-Reply-To header
      team.teamId, // taskId - use teamId for thread persistence
      team.teamId,
      undefined, // subTeamId
      weekOf,
      'report_reminder'
    );

    if (result.success && result.gmailThreadId && result.gmailMessageId) {
      // Save thread info - persistent thread across all weeks (simplified like task emails)
      // Use the Gmail-stored Message-ID if available for proper threading
      const finalMessageId = result.storedMessageId || result.gmailMessageId;
      
      await updateReportReminderThreadId(team.teamId, recipientEmail, result.gmailThreadId, finalMessageId);

      // Mark as first email sent if applicable
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

/**
 * Main function to check and send report reminders
 * This should be called by a cron job (e.g., every hour)
 */
export async function checkAndSendReportReminders(): Promise<void> {
  try {
    const currentDay = getCurrentDayOfWeek();
    const timeInfo = getCurrentTimeInfo();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // Only send emails after 9:30 AM IST (more robust than exact time check)
    if (timeInfo.hour < 9 || (timeInfo.hour === 9 && timeInfo.minute < 30)) {
      logger.info(`[SCHEDULER] Skipping report reminders - current time is ${timeInfo.hour}:${timeInfo.minute.toString().padStart(2, '0')} (scheduled for after 9:30)`);
      return;
    }
    
    logger.info(`[SCHEDULER] Checking report reminders for ${currentDay} at ${now.toISOString()}`);

    // Fetch settings from Google Sheets
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData) {
      logger.error('[SCHEDULER] Failed to generate Google Sheets token');
      return;
    }

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const accessToken = tokenData.accessToken;
    const settingsRows = await fetchSheetValues(accessToken, spreadsheetId, 'settings!A:B');
    
    if (!settingsRows) {
      logger.error('[SCHEDULER] Failed to fetch settings sheet');
      return;
    }

    // Check if already sent today
    const lastReportReminderDate = getSettingValue(settingsRows, 'last_report_reminder_date', '');
    const lastReportReminderStatus = getSettingValue(settingsRows, 'last_report_reminder_status', '');
    
    if (lastReportReminderDate === todayStr && lastReportReminderStatus === 'success') {
      logger.info('[SCHEDULER] Report reminders already sent successfully today, skipping');
      return;
    }

    // Update status to running
    await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_report_reminder_date', todayStr);
    await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_report_reminder_status', 'running');

    // Get all team report configurations
    const configs = await getTeamReportConfigs();
    logger.info(`Found ${configs.length} team report configurations`);

    // Get all teams from Firestore for name lookup
    const teamsSnapshot = await firestoreAdmin.collection('teams').get();
    const teamMap = new Map<string, string>();
    teamsSnapshot.forEach(doc => {
      const team = doc.data();
      if (team.Active !== false) {
        teamMap.set(doc.id, team.TeamName);
      }
    });

    // Get all sub-teams from Firestore for name lookup
    const subTeamsSnapshot = await firestoreAdmin.collection('sub_teams').get();
    const subTeamMap = new Map<string, { name: string; parentTeamId: string }>();
    subTeamsSnapshot.forEach(doc => {
      const subTeam = doc.data();
      subTeamMap.set(doc.id, {
        name: subTeam.SubTeamName,
        parentTeamId: subTeam.TeamID,
      });
    });

    // Process each configuration
    const entitiesToRemind: TeamWithConfig[] = [];

    for (const config of configs) {
      if (!config.active) continue;
      if (config.reminderDay !== currentDay) continue;

      let teamName: string;
      let leaderEmails: string[] = [];

      if (config.entityType === 'subteam' && config.parentTeamId) {
        // Sub-team: get name from sub-team map, emails from settings
        const subTeamInfo = subTeamMap.get(config.teamId);
        if (!subTeamInfo) {
          logger.warn(`Sub-team ${config.teamId} not found in Firestore`);
          continue;
        }
        teamName = subTeamInfo.name;
        leaderEmails = getSubTeamLeaderEmails(settingsRows, config.parentTeamId, config.teamId);
      } else {
        // Team: get name from team map, emails from settings
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

    logger.info(`[SCHEDULER] Sending reminders to ${entitiesToRemind.length} entities`);

    const weekOf = getWeekOfDate(new Date());
    logger.info(`[SCHEDULER] Week of: ${weekOf}`);
    let successCount = 0;
    let failureCount = 0;

    for (const entity of entitiesToRemind) {
      const recipients = getTeamRecipients(entity);
      logger.info(`[SCHEDULER] Processing ${entity.teamName} (ID: ${entity.teamId}) with ${recipients.length} recipients: ${recipients.join(', ')}`);

      for (const recipient of recipients) {
        const isFirstTime = !(await hasReceivedFirstReportEmail(recipient));
        logger.info(`[SCHEDULER] Sending to ${recipient} - First time: ${isFirstTime}`);

        const result = await sendReportReminder(recipient, entity, isFirstTime, weekOf);

        if (result.success) {
          successCount++;
          logger.info(`[SCHEDULER] ✓ Report reminder sent to ${recipient} for ${entity.teamName}`);
        } else {
          failureCount++;
          logger.error(`[SCHEDULER] ✗ Failed to send report reminder to ${recipient} for ${entity.teamName}`);

          // Log failure for admin visibility
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

    logger.info(`[SCHEDULER] Report reminder check complete: ${successCount} sent, ${failureCount} failed`);

    // Update final status
    const finalStatus = failureCount === 0 ? 'success' : 'partial_success';
    await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_report_reminder_status', finalStatus);

  } catch (error) {
    logger.error('Error in checkAndSendReportReminders:', error);
    // Update status to failed on error
    try {
      const tokenData = await generateGoogleSheetsToken();
      if (tokenData && tokenData.spreadsheetId) {
        const settingsRows = await fetchSheetValues(tokenData.accessToken, tokenData.spreadsheetId, 'settings!A:B');
        if (settingsRows) {
          await saveSettingValue(tokenData.accessToken, tokenData.spreadsheetId, settingsRows, 'last_report_reminder_status', 'failed');
        }
      }
    } catch (saveError) {
      logger.error('Failed to update error status:', saveError);
    }
  }
}

/**
 * Initialize the report reminder scheduler
 * This sets up the Firebase collection for tracking failures
 */
export async function initializeReportReminderScheduler(): Promise<void> {
  try {
    // Create index for report_reminder_failures if needed
    logger.info('Report reminder scheduler initialized');
  } catch (error) {
    logger.error('Error initializing report reminder scheduler:', error);
  }
}
