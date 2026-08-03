import { firestoreAdmin } from './firebaseAdmin';
import { logger } from '../utils/logger';
import { sendEmailAsUser } from './emailService';
import { getEmailTemplate } from './emailTemplateStorage';
import { getTeamReportConfigs, TeamReportConfig } from './teamReportConfigService';
import { hasReceivedFirstReportEmail, markFirstReportEmailSent } from './userOnboardingService';
import { getOrCreateTeamEmailThread, updateTeamEmailThreadId } from './emailLogService';
import { ttlCache } from '../utils/ttlCache';
import crypto from 'crypto';

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

const TEAMS_CACHE_KEY = 'teams:all';
const SUBTEAMS_CACHE_KEY = 'subTeams:all';
const TEAMS_CACHE_TTL = 5 * 60 * 1000; // 5 min
const SUBTEAMS_CACHE_TTL = 5 * 60 * 1000; // 5 min

async function getAllTeamsCached() {
  return ttlCache.getOrFetch(TEAMS_CACHE_KEY, TEAMS_CACHE_TTL, () =>
    firestoreAdmin.collection('teams').get()
  );
}

async function getAllSubTeamsCached() {
  return ttlCache.getOrFetch(SUBTEAMS_CACHE_KEY, SUBTEAMS_CACHE_TTL, () =>
    firestoreAdmin.collection('sub_teams').get()
  );
}

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
 * Gets the current day of week for a specific timezone
 */
function getCurrentDayOfWeekForTimezone(timezone: string): DayOfWeek {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { timeZone: timezone, weekday: 'long' };
  const dayName = new Intl.DateTimeFormat('en-US', options).format(now);
  return dayName as DayOfWeek;
}

/**
 * Gets current time info for a specific timezone
 */
function getCurrentTimeInfoForTimezone(timezone: string): { hour: number; minute: number } {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return { hour, minute };
}

/**
 * Checks if it's time to send reminder for a team based on their timezone and reminder time
 */
function shouldSendReminderForTeam(config: TeamReportConfig): boolean {
  const currentDay = getCurrentDayOfWeekForTimezone(config.timezone);
  const timeInfo = getCurrentTimeInfoForTimezone(config.timezone);
  const [reminderHour, reminderMinute] = config.reminderTime.split(':').map(Number);
  
  // Check if today is the reminder day
  if (currentDay !== config.reminderDay) {
    return false;
  }
  
  // Check if current time is past the reminder time
  if (timeInfo.hour < reminderHour || (timeInfo.hour === reminderHour && timeInfo.minute < reminderMinute)) {
    return false;
  }
  
  return true;
}

/**
 * Get the current day of week in the configured timezone
 * @deprecated Use getCurrentDayOfWeekForTimezone instead
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
 * Atomically claim a reminder slot for a team using Firestore .create()
 * Returns true if the slot was claimed (first to claim), false if already claimed or sent.
 * If the slot exists but is in 'failed' status, it is eligible for retry —
 * the doc is deleted first and then re-claimed atomically.
 * This prevents race conditions where multiple processes might try to send simultaneously.
 */
async function tryClaimReminderSlot(teamId: string, todayStr: string): Promise<boolean> {
  const docRef = firestoreAdmin.collection('report_reminder_sent_log').doc(`${teamId}_${todayStr}`);
  try {
    await docRef.create({
      teamId,
      date: todayStr,
      status: 'claimed',
      claimedAt: new Date().toISOString(),
    });
    return true; // we own this slot
  } catch (err: any) {
    if (err.code === 6 || String(err.message).includes('ALREADY_EXISTS')) {
      // Doc already exists — check if it's a failed attempt eligible for retry
      try {
        const existing = await docRef.get();
        if (existing.exists && existing.data()?.status === 'failed') {
          // Re-claim by overwriting — this is safe because only 'failed' status
          // indicates the previous attempt did NOT send an email.
          // 'claimed' or 'sent' docs must never be overwritten.
          await docRef.set({
            teamId,
            date: todayStr,
            status: 'claimed',
            claimedAt: new Date().toISOString(),
            retriedAt: new Date().toISOString(),
          });
          logger.info(`[SCHEDULER] Re-claimed failed slot for team ${teamId} on ${todayStr} — will retry`);
          return true;
        }
      } catch (retryErr) {
        logger.error(`Error checking/reclaiming failed slot for team ${teamId}:`, retryErr);
      }
      return false; // slot is claimed or sent — skip
    }
    logger.error(`Error claiming reminder slot for team ${teamId}:`, err);
    throw err; // fail CLOSED on unexpected Firestore errors — don't risk a duplicate send
  }
}

/**
 * Mark that a reminder was successfully sent today for a specific team
 */
async function markReminderSentToday(teamId: string, todayStr: string): Promise<void> {
  try {
    await firestoreAdmin.collection('report_reminder_sent_log').doc(`${teamId}_${todayStr}`).update({
      status: 'sent',
      sentAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`Error marking reminder sent for team ${teamId}:`, err);
  }
}

/**
 * Mark that a reminder send failed for a specific team.
 * A 'failed' slot is eligible for retry on the next scheduler invocation
 * (same day), so the scheduler will attempt to re-claim and resend.
 */
async function markReminderFailed(teamId: string, todayStr: string, error: string): Promise<void> {
  try {
    await firestoreAdmin.collection('report_reminder_sent_log').doc(`${teamId}_${todayStr}`).update({
      status: 'failed',
      failedAt: new Date().toISOString(),
      error,
    });
  } catch (err) {
    logger.error(`Error marking reminder failed for team ${teamId}:`, err);
  }
}

/**
 * Generate a temporary password for onboarding emails
 * Uses crypto.randomBytes for secure random generation
 */
function generateTempPassword(): string {
  return crypto.randomBytes(9).toString('base64url'); // 12 chars, url-safe
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
 * Send report reminder email to a team (all recipients in TO field)
 */
async function sendReportReminder(
  recipientEmails: string[],
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

    // Use first recipient for template variables (for credentials)
    const primaryRecipient = recipientEmails[0];
    let officialWorkMail = primaryRecipient;
    let temporaryPassword = '';
    
    if (isFirstTime) {
      // Generate a temporary password for onboarding
      temporaryPassword = generateTempPassword();
      logger.info(`Generated temporary password for ${primaryRecipient}`);
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
      logger.info(`First-time onboarding email for ${team.teamName} - starting fresh thread`);
      threadId = undefined;
      messageId = undefined;
    } else {
      // Reminder email: must reply to existing thread
      const threadInfo = await getOrCreateReportReminderThread(team.teamId, primaryRecipient);
      if (!threadInfo) {
        logger.error(`Failed to get or create thread for team ${team.teamId}`);
        return { success: false };
      }

      if (!threadInfo.threadId) {
        // BUG: Reminder email sent without existing thread - this shouldn't happen
        // if onboarding status tracking is working correctly
        logger.error(`Reminder email for ${team.teamName} but no existing thread found - onboarding may not have been sent`);
        // For now, we'll allow it to start a new thread, but this should be investigated
        threadId = undefined;
        messageId = undefined;
      } else {
        threadId = threadInfo.threadId;
        messageId = threadInfo.messageId;
      }
    }

    // For scheduled report reminders, use the first team leader as the acting user
    // This ensures emails are sent from a real user account, not a system sender
    const actingUserEmail = primaryRecipient || recipientEmails[0] || config.DEFAULT_FALLBACK_EMAIL;
    
    const result = await sendEmailAsUser(
      actingUserEmail,
      primaryRecipient, // Primary TO recipient
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
      recipientEmails, // toRecipients - all leaders in TO field
      'report_reminder', // eventType
      false // forceSystemSender - use acting user's Gmail account
    );

    if (result.success && result.gmailThreadId && result.gmailMessageId) {
      // Save thread info - persistent thread across all weeks (simplified like task emails)
      // Use the generated Message-ID for threading (RFC-822 compliant)
      await updateReportReminderThreadId(team.teamId, primaryRecipient, result.gmailThreadId, result.gmailMessageId);

      // Mark as first email sent for all recipients if applicable
      if (isFirstTime) {
        for (const recipient of recipientEmails) {
          await markFirstReportEmailSent(recipient);
        }
      }
    }

    return result;
  } catch (error) {
    logger.error(`Error sending report reminder to ${team.teamName}:`, error);
    return { success: false };
  }
}

interface JobRunLog {
  jobName: string;
  scheduledTime: string;
  actualRunTime: string;
  teamsProcessed: Array<{
    teamId: string;
    teamName: string;
    status: 'sent' | 'failed' | 'skipped';
    reason?: string;
    recipients: string[];
    gmailMessageId?: string;
    error?: string;
  }>;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  triggeredBy: 'scheduler' | 'manual';
  triggeredByUser?: string;
}

/**
 * Logs a job run to Firestore for observability
 */
async function logJobRun(log: JobRunLog): Promise<void> {
  try {
    // Strip undefined values before writing to Firestore to avoid errors
    // NOTE: This filter is shallow - only removes top-level undefined values.
    // If JobRunLog ever gains nested objects with optional fields, this will need
    // to be updated to recursively strip undefineds from nested structures.
    const cleanLog = Object.fromEntries(
      Object.entries(log).filter(([, v]) => v !== undefined)
    );
    await firestoreAdmin.collection('job_runs').add({
      ...cleanLog,
      timestamp: new Date().toISOString(),
    });
    logger.info(`[JOB RUN] Logged job run: ${log.jobName}, teams: ${log.teamsProcessed.length}, success: ${log.successCount}, failed: ${log.failureCount}`);
  } catch (err) {
    logger.error('[JOB RUN] Failed to log job run:', err);
  }
}

/**
 * Main function to check and send report reminders
 * This should be called by a cron job (e.g., every hour)
 */
export async function checkAndSendReportReminders(triggeredBy: 'scheduler' | 'manual' = 'scheduler', triggeredByUser?: string): Promise<JobRunLog> {
  try {
    const currentDay = getCurrentDayOfWeek();
    const timeInfo = getCurrentTimeInfo();
    const now = new Date();

    // Initialize job run log early so it's available for early returns
    const jobRunLog: JobRunLog = {
      jobName: 'report_reminder',
      scheduledTime: now.toISOString(),
      actualRunTime: new Date().toISOString(),
      teamsProcessed: [],
      successCount: 0,
      failureCount: 0,
      skippedCount: 0,
      triggeredBy,
      triggeredByUser,
    };

    // For manual triggers, skip the time check entirely
    if (triggeredBy === 'manual') {
      logger.info(`[SCHEDULER] Manual trigger - skipping time check`);
    }
    
    logger.info(`[SCHEDULER] Checking report reminders for ${currentDay} at ${now.toISOString()} (triggered by: ${triggeredBy})`);

    // Fetch settings from Google Sheets
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData) {
      logger.error('[SCHEDULER] Failed to generate Google Sheets token');
      jobRunLog.teamsProcessed = [];
      await logJobRun(jobRunLog);
      return jobRunLog;
    }

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const accessToken = tokenData.accessToken;
    const settingsRows = await fetchSheetValues(accessToken, spreadsheetId, 'settings!A:B');
    
    if (!settingsRows) {
      logger.error('[SCHEDULER] Failed to fetch settings sheet');
      jobRunLog.teamsProcessed = [];
      await logJobRun(jobRunLog);
      return jobRunLog;
    }

    // Check for concurrent runs using short-lived mutex (prevents duplicate processes)
    // This is NOT a "did we succeed today" flag - per-team tracking handles that
    const schedulerLockDoc = await firestoreAdmin.collection('scheduler_locks').doc('report_reminder').get();
    const lockData = schedulerLockDoc.exists ? schedulerLockDoc.data() : null;

    if (lockData) {
      const lastRunStatus = lockData.lastRunStatus || '';
      const lastRunTimestamp = lockData.lastRunTimestamp || '';

      // Check if status is running but stale (older than 5 minutes) - indicates crashed run
      let isStaleRunning = false;
      if (lastRunStatus === 'running' && lastRunTimestamp) {
        try {
          const startTime = new Date(lastRunTimestamp).getTime();
          const elapsedMs = Date.now() - startTime;
          if (elapsedMs > 5 * 60 * 1000) { // 5 minutes
            isStaleRunning = true;
            logger.warn('[SCHEDULER] Previous run stale (running > 5 min), will retry');
          }
        } catch (e) {
          logger.error('[SCHEDULER] Error parsing timestamp', e);
        }
      }

      const isRunningRecently = lastRunStatus === 'running' && !isStaleRunning;

      if (isRunningRecently) {
        logger.info('[SCHEDULER] Report reminders already running, skipping to prevent concurrent execution');
        return jobRunLog;
      }
    }

    // Set lock to running with timestamp (short-lived mutex only)
    await firestoreAdmin.collection('scheduler_locks').doc('report_reminder').set({
      lastRunStatus: 'running',
      lastRunTimestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });

    try {
      // Check email_enabled_scheduled_reports flag from Firestore (authoritative source)
    const scheduledReportsDoc = await firestoreAdmin.collection('settings').doc('email_enabled_scheduled_reports').get();
    const scheduledReportsEnabled = scheduledReportsDoc.exists 
      ? scheduledReportsDoc.data()?.Value === 'true'
      : true; // Default to enabled if setting doesn't exist

      if (!scheduledReportsEnabled) {
        logger.info('[SCHEDULER] Skipping — email_enabled_scheduled_reports is disabled in Firestore');
        jobRunLog.teamsProcessed = [];
        await logJobRun(jobRunLog);
        return jobRunLog;
      }

    // Get all team report configurations
    const configs = await getTeamReportConfigs();
    logger.info(`Found ${configs.length} team report configurations`);

    // Get all teams from Firestore for name lookup (cached)
    const teamsSnapshot = await getAllTeamsCached();
    const teamMap = new Map<string, string>();
    teamsSnapshot.forEach(doc => {
      const team = doc.data();
      if (team.Active !== false) {
        teamMap.set(doc.id, team.TeamName);
      }
    });

    // Get all sub-teams from Firestore for name lookup (cached)
    const subTeamsSnapshot = await getAllSubTeamsCached();
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
    const todayStr = new Date().toISOString().split('T')[0];

    for (const config of configs) {
      if (!config.active) continue;

      // 1. Time check FIRST — don't burn the slot if it's simply too early in the day.
      //    The slot is a one-per-day atomic resource; claiming it before the time check
      //    would permanently prevent the email from being sent on that day.
      if (!shouldSendReminderForTeam(config)) {
        logger.info(`[SCHEDULER] Skipping ${config.teamName} - not time yet in their timezone (${config.timezone})`);
        jobRunLog.skippedCount++;
        jobRunLog.teamsProcessed.push({
          teamId: config.teamId,
          teamName: config.teamName,
          status: 'skipped',
          reason: 'Not time yet in team timezone',
          recipients: [],
        });
        continue;
      }

      // 2. Atomically claim the reminder slot — prevents duplicate sends across retries,
      //    concurrent Cloud Scheduler invocations, and manual triggers on the same day.
      const claimed = await tryClaimReminderSlot(config.teamId, todayStr);
      if (!claimed) {
        logger.info(`[SCHEDULER] Skipping ${config.teamName} - slot already claimed/sent today`);
        jobRunLog.skippedCount++;
        jobRunLog.teamsProcessed.push({
          teamId: config.teamId,
          teamName: config.teamName,
          status: 'skipped',
          reason: 'Already sent today',
          recipients: [],
        });
        continue;
      }

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

      // Skip if already sent to this team in this run
      if (sentRecipients.has(entity.teamId)) {
        logger.info(`[SCHEDULER] Skipping ${entity.teamName} - already sent in this run`);
        jobRunLog.teamsProcessed.push({
          teamId: entity.teamId,
          teamName: entity.teamName,
          status: 'skipped',
          reason: 'Already sent in this run',
          recipients,
        });
        jobRunLog.skippedCount++;
        continue;
      }

      // Check if any recipient is first-time (if any is first-time, treat as first-time for the team)
      let isFirstTimeForTeam = false;
      for (const recipient of recipients) {
        if (!(await hasReceivedFirstReportEmail(recipient))) {
          isFirstTimeForTeam = true;
          break;
        }
      }
      logger.info(`[SCHEDULER] Sending to ${entity.teamName} - First time for team: ${isFirstTimeForTeam}`);

      const result = await sendReportReminder(recipients, entity, isFirstTimeForTeam, weekOf);

      if (result.success) {
        successCount++;
        sentRecipients.add(entity.teamId);
        // Mark this team as sent today (per-team tracking)
        await markReminderSentToday(entity.teamId, todayStr);
        logger.info(`[SCHEDULER] ✓ Report reminder sent to ${entity.teamName} for ${recipients.length} recipients`);
        jobRunLog.teamsProcessed.push({
          teamId: entity.teamId,
          teamName: entity.teamName,
          status: 'sent',
          recipients,
          gmailMessageId: result.gmailMessageId,
        });
      } else {
        failureCount++;
        logger.error(`[SCHEDULER] ✗ Failed to send report reminder to ${entity.teamName}`);

        const errorReason = 'Email send failed';
        jobRunLog.teamsProcessed.push({
          teamId: entity.teamId,
          teamName: entity.teamName,
          status: 'failed',
          reason: errorReason,
          recipients,
          error: errorReason,
        });

        // Mark as failed to allow retries later in the day if needed
        await markReminderFailed(entity.teamId, todayStr, errorReason);

        // Log failure for admin visibility
        await firestoreAdmin.collection('report_reminder_failures').add({
          teamId: entity.teamId,
          teamName: entity.teamName,
          recipientEmails: recipients.join(', '),
          weekOf,
          reason: errorReason,
          timestamp: new Date().toISOString(),
        });
      }
    }

    logger.info(`[SCHEDULER] Report reminder check complete: ${successCount} sent, ${failureCount} failed`);

    // Update job run log counts
    jobRunLog.successCount = successCount;
    jobRunLog.failureCount = failureCount;

      // Only log the job run when the scheduler actually did something (sent or failed).
      // Idle runs (all teams skipped, nothing attempted) produce no useful signal and
      // would write a job_runs doc every hour for free. If every team was skipped (slot
      // already claimed, wrong time) we skip the write entirely.
      const hadActivity = jobRunLog.successCount > 0 || jobRunLog.failureCount > 0;
      if (hadActivity) {
        await logJobRun(jobRunLog);
      } else {
        logger.info('[JOB RUN] Idle run — no teams processed; skipping job_runs write');
      }

      return jobRunLog;
    } finally {
      // Clear the running lock regardless of success or failure (per-team tracking handles "sent today" logic)
      await firestoreAdmin.collection('scheduler_locks').doc('report_reminder').update({
        lastRunStatus: 'idle',
        lastRunTimestamp: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

  } catch (error) {
    logger.error('Error in checkAndSendReportReminders:', error);
    
    // Log failed job run
    const failedJobRun: JobRunLog = {
      jobName: 'report_reminder',
      scheduledTime: new Date().toISOString(),
      actualRunTime: new Date().toISOString(),
      teamsProcessed: [],
      successCount: 0,
      failureCount: 0,
      skippedCount: 0,
      triggeredBy,
      triggeredByUser,
    };
    await logJobRun(failedJobRun);

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
    
    return failedJobRun;
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

let reportReminderIntervalId: NodeJS.Timeout | null = null;

// ─── job_runs TTL cleanup ──────────────────────────────────────────────────

const JOB_RUNS_RETENTION_DAYS = 30;
const CLEANUP_BATCH_SIZE = 500; // Firestore WriteBatch hard limit

/**
 * Delete job_runs documents older than JOB_RUNS_RETENTION_DAYS days.
 * Runs in batches of ≤500 to stay within the Firestore WriteBatch limit.
 * Safe to call multiple times; does nothing if there are no old documents.
 */
export async function cleanupOldJobRuns(): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - JOB_RUNS_RETENTION_DAYS);
    const cutoffIso = cutoff.toISOString();

    logger.info(`[CLEANUP] Deleting job_runs older than ${cutoffIso} (${JOB_RUNS_RETENTION_DAYS}-day retention)`);

    let totalDeleted = 0;

    // Loop until no more qualifying docs remain (handles collections larger than CLEANUP_BATCH_SIZE)
    while (true) {
      const snapshot = await firestoreAdmin
        .collection('job_runs')
        .where('timestamp', '<', cutoffIso)
        .limit(CLEANUP_BATCH_SIZE)
        .get();

      if (snapshot.empty) break;

      const batch = firestoreAdmin.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();

      totalDeleted += snapshot.docs.length;
      logger.info(`[CLEANUP] Deleted ${snapshot.docs.length} job_runs docs (${totalDeleted} total so far)`);

      // If we got fewer than the limit, we've cleared all qualifying docs
      if (snapshot.docs.length < CLEANUP_BATCH_SIZE) break;
    }

    logger.info(`[CLEANUP] job_runs cleanup complete — ${totalDeleted} docs deleted`);
  } catch (err) {
    logger.error('[CLEANUP] Failed to clean up old job_runs:', err);
    // Non-fatal: cleanup failure should not affect the scheduler's main work
  }
}

// ─── scheduler bootstrap ──────────────────────────────────────────────────

/**
 * Starts the hourly checks for report reminders.
 * Also schedules a once-daily cleanup of old job_runs documents.
 */
export function startReportReminderScheduler(): void {
  if (reportReminderIntervalId) {
    return;
  }

  logger.info('ReportReminderScheduler: Initializing hourly report reminder check...');

  // Execute once immediately on startup (will run if needed)
  checkAndSendReportReminders().catch(err => {
    logger.error('ReportReminderScheduler: Startup check failed', err);
  });

  // Check every hour
  reportReminderIntervalId = setInterval(() => {
    checkAndSendReportReminders().catch(err => {
      logger.error('ReportReminderScheduler: Interval execution failed', err);
    });
  }, 60 * 60 * 1000);

  // Run job_runs cleanup once at startup (catches any backlog), then every 24 hours
  cleanupOldJobRuns().catch(err => {
    logger.error('ReportReminderScheduler: Startup job_runs cleanup failed', err);
  });

  setInterval(() => {
    cleanupOldJobRuns().catch(err => {
      logger.error('ReportReminderScheduler: Scheduled job_runs cleanup failed', err);
    });
  }, 24 * 60 * 60 * 1000);
}
