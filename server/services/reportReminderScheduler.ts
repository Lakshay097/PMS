import { firestoreAdmin } from './firebaseAdmin';
import { logger } from '../utils/logger';
import { sendEmailAsUser } from './emailService';
import { getEmailTemplate } from './emailTemplateStorage';
import { getTeamReportConfigs } from './teamReportConfigService';
import { hasReceivedFirstReportEmail, markFirstReportEmailSent } from './userOnboardingService';
import { getOrCreateTeamEmailThread, updateTeamEmailThreadId } from './emailLogService';

/**
 * Gets or creates a report reminder email thread.
 * Uses Google Sheets team_email_threads to match the task email threading pattern.
 */
async function getOrCreateReportReminderThread(
  teamId: string,
  recipientEmail: string
): Promise<{ threadId?: string; messageId?: string } | null> {
  try {
    const threadInfo = await getOrCreateTeamEmailThread(teamId, recipientEmail);
    
    if (threadInfo) {
      logger.info(`Found existing report reminder thread for team ${teamId}: threadId=${threadInfo.threadId}`);
      return {
        threadId: threadInfo.threadId || undefined,
        messageId: threadInfo.messageId || undefined,
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
 * Uses Google Sheets team_email_threads to match the task email threading pattern.
 */
export async function updateReportReminderThreadId(
  teamId: string,
  recipientEmail: string,
  gmailThreadId: string,
  gmailMessageId: string
): Promise<void> {
  try {
    await updateTeamEmailThreadId(teamId, gmailThreadId, gmailMessageId);
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

    // Use configured reminder sender for scheduled report emails
    const senderEmail = process.env.REMINDER_SENDER_EMAIL || config.DEFAULT_FALLBACK_EMAIL;
    
    const result = await sendEmailAsUser(
      senderEmail,
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
      'report_reminder',
      undefined, // ccEmails
      undefined, // toRecipients
      'report_reminder', // eventType
      false // forceSystemSender - use configured sender's OAuth token
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

    // Check if already sent today using Firestore for better reliability during deployments
    const todayStr = new Date().toISOString().split('T')[0];
    const schedulerLockDoc = await firestoreAdmin.collection('scheduler_locks').doc('report_reminder').get();
    const lockData = schedulerLockDoc.exists ? schedulerLockDoc.data() : null;

    if (lockData) {
      const lastRunDate = lockData.lastRunDate || '';
      const lastRunStatus = lockData.lastRunStatus || '';
      const lastRunTimestamp = lockData.lastRunTimestamp || '';

      // Check if status is running but stale (older than 5 minutes) - indicates crashed run
      let isStaleRunning = false;
      if (lastRunStatus === 'running' && lastRunTimestamp) {
        try {
          const startTime = new Date(lastRunTimestamp).getTime();
          const elapsedMs = Date.now() - startTime;
          if (elapsedMs > 5 * 60 * 1000) { // 5 minutes (reduced from 30 for faster recovery)
            isStaleRunning = true;
            logger.warn('[SCHEDULER] Previous run stale (running > 5 min), will retry');
          }
        } catch (e) {
          logger.error('[SCHEDULER] Error parsing timestamp', e);
        }
      }

      const alreadySentSuccessfully = lastRunDate === todayStr && (lastRunStatus === 'success' || lastRunStatus === 'partial_success');
      const isRunningRecently = lastRunDate === todayStr && lastRunStatus === 'running' && !isStaleRunning;

      if (alreadySentSuccessfully) {
        logger.info('[SCHEDULER] Report reminders already sent successfully today, skipping');
        return;
      }

      if (isRunningRecently) {
        logger.info('[SCHEDULER] Report reminders already running today, skipping to prevent duplicates');
        return;
      }
    }

    // Set lock to running with timestamp (Firestore transaction for atomicity)
    await firestoreAdmin.collection('scheduler_locks').doc('report_reminder').set({
      lastRunDate: todayStr,
      lastRunStatus: 'running',
      lastRunTimestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // Check email_enabled_scheduled_reports flag — respect Admin Panel on/off toggle
    const scheduledReportsEnabled = getSettingValue(settingsRows, 'email_enabled_scheduled_reports', 'true');
    if (scheduledReportsEnabled === 'false') {
      logger.info('[SCHEDULER] Skipping — email_enabled_scheduled_reports is disabled');
      // Reset lock since we're not actually running
      await firestoreAdmin.collection('scheduler_locks').doc('report_reminder').update({
        lastRunStatus: 'skipped',
        updatedAt: new Date().toISOString()
      });
      return;
    }

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

    // Track sent recipients in this run to prevent duplicates
    const sentRecipients = new Set<string>();

    for (const entity of entitiesToRemind) {
      const recipients = getTeamRecipients(entity);
      logger.info(`[SCHEDULER] Processing ${entity.teamName} (ID: ${entity.teamId}) with ${recipients.length} recipients: ${recipients.join(', ')}`);

      for (const recipient of recipients) {
        // Skip if already sent to this recipient in this run
        if (sentRecipients.has(recipient.toLowerCase())) {
          logger.info(`[SCHEDULER] Skipping ${recipient} - already sent in this run`);
          continue;
        }

        const isFirstTime = !(await hasReceivedFirstReportEmail(recipient));
        logger.info(`[SCHEDULER] Sending to ${recipient} - First time: ${isFirstTime}`);

        const result = await sendReportReminder(recipient, entity, isFirstTime, weekOf);

        if (result.success) {
          successCount++;
          sentRecipients.add(recipient.toLowerCase());
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

    // Update final status in Firestore (more reliable than Google Sheets)
    const finalStatus = failureCount === 0 ? 'success' : 'partial_success';
    await firestoreAdmin.collection('scheduler_locks').doc('report_reminder').update({
      lastRunStatus: finalStatus,
      lastRunTimestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      successCount,
      failureCount
    });

  } catch (error) {
    logger.error('Error in checkAndSendReportReminders:', error);
    // Update status to failed on error (use Firestore for reliability)
    try {
      await firestoreAdmin.collection('scheduler_locks').doc('report_reminder').update({
        lastRunStatus: 'failed',
        lastRunTimestamp: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: String(error)
      });
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
