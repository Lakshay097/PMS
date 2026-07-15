import { generateGoogleSheetsToken, fetchSheetValues, appendSheetValues, updateSheetValues } from './googleSheetsService';
import { sendEmailAsUser } from './emailService';
import { logger } from '../utils/logger';
import { config } from '../config';
import { firestoreAdmin } from './firebaseAdmin';
import { getOrCreateTeamEmailThread, updateTeamEmailThreadId } from './emailLogService';

// Intra-process lock to prevent overlapping runs within the same process
let isRunning = false;

// Helper to calculate week-of date (Monday-based) for Firebase document ID
function getWeekOfDate(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0]; // YYYY-MM-DD format
}

// Helper to query and update settings in Google Sheets
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

// Timezone-aware date and weekday query
export function getLocalDateTimeInfo(): { weekday: string; dateStr: string; hour: number } {
  const tz = process.env.TZ || 'Asia/Kolkata';
  try {
    const options = {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'long',
      hour12: false
    } as const;
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(new Date());
    const result: Record<string, string> = {};
    parts.forEach(p => { result[p.type] = p.value; });
    
    return {
      weekday: result.weekday || 'Thursday',
      dateStr: `${result.year}-${result.month}-${result.day}`,
      hour: parseInt(result.hour || '0')
    };
  } catch (err) {
    logger.error(`ReminderScheduler: Error determining date in timezone ${tz}, falling back to UTC`, err);
    const now = new Date();
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return {
      weekday: DAYS[now.getUTCDay()],
      dateStr: now.toISOString().split('T')[0],
      hour: now.getUTCHours()
    };
  }
}

/**
 * Checks report submissions and sends email reminders to team leaders
 */
export async function checkAndSendWeeklyReminders(): Promise<void> {
  // Run Thursday reminder logic
  await checkThursdayReminders();
  
  // Run Saturday check for unsubmitted reports
  await checkSaturdayUnsubmittedReports();
}

/**
 * Thursday: Send email reminders to team leaders for weekly reports
 */
async function checkThursdayReminders(): Promise<void> {
  // 1. Check intra-process lock
  if (isRunning) {
    logger.warn('ReminderScheduler: Execution skipped. A scheduler run is already in progress in this instance.');
    return;
  }

  isRunning = true;

  try {
    const timeInfo = getLocalDateTimeInfo();
    const todayStr = timeInfo.dateStr;
    const currentWeekday = timeInfo.weekday;

    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('ReminderScheduler: Failed to obtain Google Sheets access token');
      isRunning = false;
      return;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const accessToken = tokenData.accessToken;

    // Fetch settings to check schedule and status
    const settingsRows = await fetchSheetValues(accessToken, spreadsheetId, 'settings!A:B');
    if (!settingsRows) {
      logger.error('ReminderScheduler: Failed to fetch settings sheet');
      isRunning = false;
      return;
    }

    // Determine target reminder day (dynamically calculated from due day or overridden)
    const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dueDaySetting = getSettingValue(settingsRows, 'weekly_report_due_day', 'Friday');
    const dueDayIndex = DAYS_OF_WEEK.findIndex(d => d.toLowerCase() === dueDaySetting.toLowerCase());
    
    // Default reminder day is 1 day before due day
    const reminderDayIndex = dueDayIndex >= 0 ? (dueDayIndex - 1 + 7) % 7 : 4; // defaults to Thursday (4)
    const targetReminderWeekday = DAYS_OF_WEEK[reminderDayIndex];

    // Check for test override
    const overrideDay = process.env.REMINDER_DAY_OVERRIDE || getSettingValue(settingsRows, 'weekly_report_reminder_day_override', '');
    const isOverrideActive = overrideDay && (overrideDay.toLowerCase() === 'today' || overrideDay.toLowerCase() === currentWeekday.toLowerCase());

    const isReminderDay = currentWeekday.toLowerCase() === targetReminderWeekday.toLowerCase();
    
    // Only execute on reminder day (Thursdays by default) after 9:00 AM local time, or if override matches today
    if (!isReminderDay && !isOverrideActive) {
      isRunning = false;
      return;
    }
    if (!isOverrideActive && timeInfo.hour < 9) {
      isRunning = false;
      return; // Do not send before 9 AM
    }

    // Retrieve last run dates and statuses
    const lastDate = getSettingValue(settingsRows, 'last_weekly_reminder_date', '');
    const lastStatus = getSettingValue(settingsRows, 'last_weekly_reminder_status', '');
    const lastTimestamp = getSettingValue(settingsRows, 'last_weekly_reminder_timestamp', '');

    // Check if status is running but stale (older than 30 minutes)
    let isStaleRunning = false;
    if (lastStatus === 'running' && lastTimestamp) {
      try {
        const startTime = new Date(lastTimestamp).getTime();
        const elapsedMs = Date.now() - startTime;
        if (elapsedMs > 30 * 60 * 1000) { // 30 minutes
          isStaleRunning = true;
        }
      } catch (e) {
        logger.error('ReminderScheduler: Error parsing timestamp', e);
      }
    }

    const alreadySentSuccessfully = lastDate === todayStr && lastStatus === 'success';
    const isRunningRecently = lastDate === todayStr && lastStatus === 'running' && !isStaleRunning;

    if (alreadySentSuccessfully) {
      isRunning = false;
      return; // Already completed run successfully today
    }
    if (isRunningRecently) {
      logger.info('ReminderScheduler: Run skipped because another instance is currently running reminders.');
      isRunning = false;
      return;
    }

    logger.info(`ReminderScheduler: Initiating weekly reminders. reason=${isOverrideActive ? 'override_active' : 'scheduled_day'}, date=${todayStr}`);

    // Update status to 'running' with current timestamp in Google Sheets immediately (cross-process lock)
    await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_weekly_reminder_date', todayStr);
    await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_weekly_reminder_status', 'running');
    await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_weekly_reminder_timestamp', new Date().toISOString());

    // Fetch active teams
    const teamsRows = await fetchSheetValues(accessToken, spreadsheetId, 'teams!A:D');
    if (!teamsRows || teamsRows.length <= 1) {
      logger.warn('ReminderScheduler: No teams available');
      await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_weekly_reminder_status', 'success');
      isRunning = false;
      return;
    }

    // Fetch sub-teams
    const subTeamsRows = await fetchSheetValues(accessToken, spreadsheetId, 'sub_teams!A:G');
    const subTeamsMap = new Map<string, Array<{ subTeamId: string; subTeamName: string; leaderEmails: string[] }>>();
    if (subTeamsRows && subTeamsRows.length > 1) {
      for (let i = 1; i < subTeamsRows.length; i++) {
        const row = subTeamsRows[i];
        const teamId = row[1];
        const subTeamId = row[0];
        const subTeamName = row[2];
        const active = row[6];
        if (teamId && subTeamId && active === 'true') {
          if (!subTeamsMap.has(teamId)) {
            subTeamsMap.set(teamId, []);
          }
          subTeamsMap.get(teamId)!.push({
            subTeamId,
            subTeamName,
            leaderEmails: row[5] ? row[5].split(',').map((e: string) => e.trim()).filter(Boolean) : []
          });
        }
      }
    }

    // Fetch weekly report requirements configuration
    const requirementsSetting = getSettingValue(settingsRows, 'weekly_report_requirements', '');
    let requirements: Record<string, { level: 'team' | 'subteam'; subTeamIds: string[] }> = {};
    try {
      if (requirementsSetting) {
        requirements = JSON.parse(requirementsSetting);
      }
    } catch (e) {
      logger.error('ReminderScheduler: Failed to parse weekly_report_requirements', e);
    }

    // Fetch submissions
    const submissionsRows = await fetchSheetValues(accessToken, spreadsheetId, 'team_submissions!A:G');

    // Calculate start of current week (Monday 00:00:00)
    const getStartOfWeek = (d: Date) => {
      const date = new Date(d);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date.setDate(diff));
      monday.setHours(0, 0, 0, 0);
      return monday;
    };
    const startOfWeek = getStartOfWeek(new Date());

    // Compile set of TeamIDs and SubTeamIDs that have submitted this week
    const submittedTeamIds = new Set<string>();
    const submittedSubTeamIds = new Set<string>();
    if (submissionsRows && submissionsRows.length > 1) {
      for (let i = 1; i < submissionsRows.length; i++) {
        const row = submissionsRows[i];
        const teamId = row[1];
        const subTeamId = row[2]; // SubTeamID column
        const submittedAtStr = row[3];
        if (teamId && submittedAtStr) {
          try {
            const submittedAtDate = new Date(submittedAtStr);
            if (submittedAtDate >= startOfWeek) {
              submittedTeamIds.add(teamId);
              if (subTeamId) {
                submittedSubTeamIds.add(subTeamId);
              }
            }
          } catch (e) {
            logger.error(`ReminderScheduler: Failed to parse submission date: ${submittedAtStr}`, e);
          }
        }
      }
    }

    // Retrieve sent teams list for today from Sheets to prevent duplicate emails on retry
    const sentTeamsStr = getSettingValue(settingsRows, 'last_weekly_reminder_sent_teams', '');
    const sentTeamIds = new Set<string>(
      lastDate === todayStr ? sentTeamsStr.split(',').map(id => id.trim()).filter(Boolean) : []
    );

    // Restrict sender to system email from config
    const senderEmail = config.DEFAULT_FALLBACK_EMAIL || config.SYSTEM_SENDER_EMAIL;
    logger.info(`ReminderScheduler: Using sender email: ${senderEmail}`);

    // Check email_enabled_scheduled_tasks flag — respect Admin Panel on/off toggle
    const scheduledTasksEnabledSetting = getSettingValue(settingsRows, 'email_enabled_scheduled_tasks', 'true');
    if (scheduledTasksEnabledSetting === 'false') {
      logger.info('ReminderScheduler: Skipping — email_enabled_scheduled_tasks is disabled');
      await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_weekly_reminder_status', 'success');
      isRunning = false;
      return;
    }

    let hasOverallTransients = false;
    let emailsSentCount = 0;

    for (let i = 1; i < teamsRows.length; i++) {
      const row = teamsRows[i];
      const teamId = row[0];
      const teamName = row[1];
      const activeVal = row[3];

      const isActive = activeVal === 'true' || activeVal === true;
      if (!isActive || !teamId) continue;

      const teamConfig = requirements[teamId];

      // If team is not configured for reports, skip
      if (!teamConfig) {
        logger.info(`ReminderScheduler: Team "${teamName}" (${teamId}) not configured for weekly reports, skipping`);
        continue;
      }

      // Handle team-level reports
      if (teamConfig.level === 'team') {
        // Skip if already submitted at team level
        if (submittedTeamIds.has(teamId)) {
          continue;
        }

        // Skip if reminder was already successfully sent to this team today
        if (sentTeamIds.has(teamId)) {
          continue;
        }

        // Fetch team leaders
        const leaderSettingKey = `team_${teamId}_leaders`;
        const leaderEmailsStr = getSettingValue(settingsRows, leaderSettingKey, '');

        if (!leaderEmailsStr) {
          logger.warn(`ReminderScheduler: No leaders configured for team "${teamName}" (${teamId}). Skipping.`);
          continue;
        }

        const leaderEmails = leaderEmailsStr
          .split(',')
          .map(e => e.trim())
          .filter(Boolean);

        if (leaderEmails.length === 0) {
          logger.warn(`ReminderScheduler: Blank leaders configured for team "${teamName}" (${teamId}). Skipping.`);
          continue;
        }

        let teamSendSuccess = true;

        // Send to team leaders
        for (const leaderEmail of leaderEmails) {
          try {
            logger.info(`ReminderScheduler: Sending weekly report reminder to ${leaderEmail} for team "${teamName}"`);
            const appUrl = config.APP_URL || 'http://localhost:3000';
            const weekOf = getWeekOfDate(new Date());
            const meetingDay = dueDaySetting || 'Friday';
            
            // Get or create team email thread from Google Sheets
            const threadInfo = await getOrCreateTeamEmailThread(teamId, leaderEmail);
            
            const result = await sendEmailAsUser(
              senderEmail,
              leaderEmail,
              '', // pre-built subject is empty so it triggers template subject variables replacement
              '', // body is empty so it triggers template body
              'template_scheduled_reminder',
              {
                TeamName: teamName,
                AppURL: appUrl,
                day: meetingDay
              },
              threadInfo?.threadId, // threadId from Google Sheets
              threadInfo?.messageId, // messageId from Google Sheets
              undefined, // taskId
              teamId,
              null, // subTeamId
              weekOf,
              'thursday_reminder',
              undefined, // ccEmails
              undefined, // toRecipients
              'weekly_report_reminder', // eventType
              true // forceSystemSender - system-generated email
            );

            if (result.success) {
              emailsSentCount++;
              logger.info(`ReminderScheduler: Email sent successfully to ${leaderEmail} for team "${teamName}"`);

              // Update threadId/messageId in Google Sheets team_email_threads
              if (result.gmailThreadId && result.gmailMessageId && !result.usedFallback) {
                try {
                  await updateTeamEmailThreadId(teamId, result.gmailThreadId, result.gmailMessageId);
                  logger.info(`ReminderScheduler: Stored threadId for team "${teamName}"`);
                } catch (sheetsErr) {
                  logger.error(`ReminderScheduler: Failed to store threadId in Google Sheets for team "${teamName}"`, sheetsErr);
                }
              } else if (result.usedFallback) {
                logger.warn(`ReminderScheduler: Reminder email for team "${teamName}" used fallback (not actually sent)`);
              }
            } else {
              teamSendSuccess = false;
              hasOverallTransients = true;
              logger.error(`ReminderScheduler: Failed to send email to ${leaderEmail} for team "${teamName}". Error: ${result.error || 'Unknown error'}`);
            }
          } catch (err) {
            logger.error(`ReminderScheduler: Failed to send reminder email to ${leaderEmail} for team "${teamName}"`, err);
            teamSendSuccess = false;
            hasOverallTransients = true;
          }
        }

        // If sending to all leaders succeeded, record it immediately in Google Sheets to prevent duplicates
        if (teamSendSuccess) {
          sentTeamIds.add(teamId);
          const newSentTeamsStr = Array.from(sentTeamIds).join(',');
          await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_weekly_reminder_sent_teams', newSentTeamsStr);
        }
      } else if (teamConfig.level === 'subteam') {
        // Handle sub-team level reports
        const teamSubTeams = subTeamsMap.get(teamId) || [];
        const requiredSubTeamIds = teamConfig.subTeamIds || [];

        for (const subTeam of teamSubTeams) {
          // Skip if this sub-team is not required to submit
          if (!requiredSubTeamIds.includes(subTeam.subTeamId)) {
            continue;
          }

          // Skip if already submitted for this sub-team
          if (submittedSubTeamIds.has(subTeam.subTeamId)) {
            continue;
          }

          // Skip if reminder was already sent for this sub-team today
          const sentKey = `${teamId}:${subTeam.subTeamId}`;
          if (sentTeamIds.has(sentKey)) {
            continue;
          }

          // Use sub-team leaders if configured, otherwise fall back to team leaders
          const leaderEmails = subTeam.leaderEmails.length > 0 
            ? subTeam.leaderEmails 
            : (() => {
                const leaderSettingKey = `team_${teamId}_leaders`;
                const leaderEmailsStr = getSettingValue(settingsRows, leaderSettingKey, '');
                return leaderEmailsStr ? leaderEmailsStr.split(',').map(e => e.trim()).filter(Boolean) : [];
              })();

          if (leaderEmails.length === 0) {
            logger.warn(`ReminderScheduler: No leaders configured for sub-team "${subTeam.subTeamName}" (${subTeam.subTeamId}). Skipping.`);
            continue;
          }

          let subTeamSendSuccess = true;

          // Send to sub-team leaders
          for (const leaderEmail of leaderEmails) {
            try {
              logger.info(`ReminderScheduler: Sending weekly report reminder to ${leaderEmail} for sub-team "${subTeam.subTeamName}" of team "${teamName}"`);
              const appUrl = config.APP_URL || 'http://localhost:3000';
              const weekOf = getWeekOfDate(new Date());
              const meetingDay = dueDaySetting || 'Friday';
              
              // Get or create team email thread from Google Sheets (use teamId for sub-teams too)
              const threadInfo = await getOrCreateTeamEmailThread(teamId, leaderEmail);
              
              const result = await sendEmailAsUser(
                senderEmail,
                leaderEmail,
                '',
                '',
                'template_scheduled_reminder',
                {
                  TeamName: teamName,
                  SubTeamName: subTeam.subTeamName,
                  AppURL: appUrl,
                  day: meetingDay
                },
                threadInfo?.threadId, // threadId from Google Sheets
                threadInfo?.messageId, // messageId from Google Sheets
                undefined, // taskId
                teamId,
                subTeam.subTeamId,
                weekOf,
                'thursday_reminder',
                undefined, // ccEmails
                undefined, // toRecipients
                'weekly_report_reminder', // eventType
                true // forceSystemSender - system-generated email
              );

              if (result.success) {
                emailsSentCount++;
                logger.info(`ReminderScheduler: Email sent successfully to ${leaderEmail} for sub-team "${subTeam.subTeamName}"`);

                // Update threadId/messageId in Google Sheets team_email_threads
                if (result.gmailThreadId && result.gmailMessageId && !result.usedFallback) {
                  try {
                    await updateTeamEmailThreadId(teamId, result.gmailThreadId, result.gmailMessageId);
                    logger.info(`ReminderScheduler: Stored threadId for sub-team "${subTeam.subTeamName}"`);
                  } catch (sheetsErr) {
                    logger.error(`ReminderScheduler: Failed to store threadId in Google Sheets for sub-team "${subTeam.subTeamName}"`, sheetsErr);
                  }
                } else if (result.usedFallback) {
                  logger.warn(`ReminderScheduler: Reminder email for sub-team "${subTeam.subTeamName}" used fallback (not actually sent)`);
                }
              } else {
                subTeamSendSuccess = false;
                hasOverallTransients = true;
                logger.error(`ReminderScheduler: Failed to send email to ${leaderEmail} for sub-team "${subTeam.subTeamName}". Error: ${result.error || 'Unknown error'}`);
              }
            } catch (err) {
              logger.error(`ReminderScheduler: Failed to send reminder email to ${leaderEmail} for sub-team "${subTeam.subTeamName}"`, err);
              subTeamSendSuccess = false;
              hasOverallTransients = true;
            }
          }

          // If sending to all leaders succeeded, record it immediately in Google Sheets to prevent duplicates
          if (subTeamSendSuccess) {
            sentTeamIds.add(sentKey);
            const newSentTeamsStr = Array.from(sentTeamIds).join(',');
            await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_weekly_reminder_sent_teams', newSentTeamsStr);
          }
        }
      }
    }

    // Write final status
    const finalStatus = hasOverallTransients ? 'failed' : 'success';
    await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_weekly_reminder_status', finalStatus);
    
    // Clear sent_teams setting if this run was a full success to reset for next week
    if (finalStatus === 'success') {
      await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_weekly_reminder_sent_teams', '');
    }

    logger.info(`ReminderScheduler: Execution complete. status=${finalStatus}, emailsSent=${emailsSentCount}`);
  } catch (err) {
    logger.error('ReminderScheduler: Critical error in weekly report reminders scheduler:', err);
  } finally {
    isRunning = false;
  }
}

/**
 * Saturday: Check for unsubmitted weekly reports and flag them for Admin dashboard
 * This is dashboard-visibility only - no email is sent to Admin
 */
async function checkSaturdayUnsubmittedReports(): Promise<void> {
  try {
    const timeInfo = getLocalDateTimeInfo();
    const todayStr = timeInfo.dateStr;
    const currentWeekday = timeInfo.weekday;

    // Only run on Saturday
    if (currentWeekday.toLowerCase() !== 'saturday') {
      return;
    }

    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('ReminderScheduler: Saturday check - Failed to obtain Google Sheets access token');
      return;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const accessToken = tokenData.accessToken;

    // Fetch settings to check if already ran today
    const settingsRows = await fetchSheetValues(accessToken, spreadsheetId, 'settings!A:B');
    if (!settingsRows) {
      logger.error('ReminderScheduler: Saturday check - Failed to fetch settings sheet');
      return;
    }

    const lastSaturdayCheck = getSettingValue(settingsRows, 'last_saturday_check_date', '');
    
    // Skip if already ran today
    if (lastSaturdayCheck === todayStr) {
      logger.info('ReminderScheduler: Saturday check already completed today');
      return;
    }

    logger.info(`ReminderScheduler: Initiating Saturday check for unsubmitted reports. date=${todayStr}`);

    // Calculate start of the reporting week (Saturday 00:00:00, after previous Friday deadline)
    // This aligns with the Thursday email → Friday EOD deadline cycle
    const getStartOfReportingWeek = (d: Date) => {
      const date = new Date(d);
      const day = date.getDay();
      // If today is Saturday (6), start is today at 00:00:00
      // If today is Sunday (0), start was yesterday (Saturday)
      // Otherwise, calculate the most recent Saturday
      const diff = day === 6 ? 0 : (day === 0 ? -1 : -(day - 6));
      const saturday = new Date(date.setDate(date.getDate() + diff));
      saturday.setHours(0, 0, 0, 0);
      return saturday;
    };
    const startOfWeek = getStartOfReportingWeek(new Date());

    // Fetch teams
    const teamsRows = await fetchSheetValues(accessToken, spreadsheetId, 'teams!A:D');
    if (!teamsRows || teamsRows.length <= 1) {
      logger.warn('ReminderScheduler: Saturday check - No teams available');
      return;
    }

    // Fetch submissions
    const submissionsRows = await fetchSheetValues(accessToken, spreadsheetId, 'team_submissions!A:F');

    // Compile set of TeamIDs that have submitted this week
    const submittedTeamIds = new Set<string>();
    if (submissionsRows && submissionsRows.length > 1) {
      for (let i = 1; i < submissionsRows.length; i++) {
        const row = submissionsRows[i];
        const teamId = row[1];
        const submittedAtStr = row[3];
        if (teamId && submittedAtStr) {
          try {
            const submittedAtDate = new Date(submittedAtStr);
            if (submittedAtDate >= startOfWeek) {
              submittedTeamIds.add(teamId);
            }
          } catch (e) {
            logger.error(`ReminderScheduler: Saturday check - Failed to parse submission date: ${submittedAtStr}`, e);
          }
        }
      }
    }

    // Identify teams that haven't submitted
    const unsubmittedTeams: string[] = [];
    for (let i = 1; i < teamsRows.length; i++) {
      const row = teamsRows[i];
      const teamId = row[0];
      const teamName = row[1];
      const activeVal = row[3];

      const isActive = activeVal === 'true' || activeVal === true;
      if (!isActive || !teamId) continue;

      if (!submittedTeamIds.has(teamId)) {
        unsubmittedTeams.push(teamId);
        logger.info(`ReminderScheduler: Saturday check - Team "${teamName}" (${teamId}) has not submitted this week`);
      }
    }

    // Store unsubmitted teams in settings for Admin dashboard visibility
    if (unsubmittedTeams.length > 0) {
      const unsubmittedTeamsStr = unsubmittedTeams.join(',');
      await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'unsubmitted_teams_this_week', unsubmittedTeamsStr);
      logger.info(`ReminderScheduler: Saturday check - Flagged ${unsubmittedTeams.length} unsubmitted teams for Admin dashboard`);
    } else {
      await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'unsubmitted_teams_this_week', '');
      logger.info('ReminderScheduler: Saturday check - All teams have submitted, no flags needed');
    }

    // Update last check date
    await saveSettingValue(accessToken, spreadsheetId, settingsRows, 'last_saturday_check_date', todayStr);

    logger.info('ReminderScheduler: Saturday check completed successfully');
  } catch (err) {
    logger.error('ReminderScheduler: Critical error in Saturday check:', err);
  }
}

let schedulerIntervalId: NodeJS.Timeout | null = null;

/**
 * Starts the hourly checks for weekly reminders
 */
export function startReminderScheduler(): void {
  if (schedulerIntervalId) {
    return;
  }

  logger.info('ReminderScheduler: Initializing hourly weekly report reminder check...');

  // Execute once immediately on startup (will run if needed)
  checkAndSendWeeklyReminders().catch(err => {
    logger.error('ReminderScheduler: Startup check failed', err);
  });

  // Check every hour
  schedulerIntervalId = setInterval(() => {
    checkAndSendWeeklyReminders().catch(err => {
      logger.error('ReminderScheduler: Interval execution failed', err);
    });
  }, 60 * 60 * 1000);
}

