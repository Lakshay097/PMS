import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import { firestoreAdmin } from './server/services/firebaseAdmin';
import { logger } from './server/utils/logger';
import { getTeamReportConfigs } from './server/services/teamReportConfigService';
import { hasReceivedFirstReportEmail } from './server/services/userOnboardingService';
import { generateGoogleSheetsToken, fetchSheetValues } from './server/services/googleSheetsService';
import { config } from './server/config';

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

function getSettingValue(rows: any[][] | null, key: string, defaultValue: string): string {
  if (!rows) return defaultValue;
  const row = rows.find(r => r[0] === key);
  return row && row[1] !== undefined && row[1] !== null ? String(row[1]) : defaultValue;
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

function getWeekOfDate(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(3, '0')}`;
}

async function dryRunReportReminders() {
  try {
    console.log('=== DRY RUN: Report Reminder Scheduler ===\n');
    
    const currentDay = getCurrentDayOfWeek();
    const timeInfo = getCurrentTimeInfo();
    const now = new Date();
    
    console.log(`Current time: ${now.toISOString()}`);
    console.log(`Current day (${process.env.TZ || 'Asia/Kolkata'}): ${currentDay}`);
    console.log(`Current time: ${timeInfo.hour}:${timeInfo.minute.toString().padStart(2, '0')}`);
    console.log('');

    // Check time threshold
    if (timeInfo.hour < 9 || (timeInfo.hour === 9 && timeInfo.minute < 30)) {
      console.log('[DRY RUN] Would SKIP - current time is before 9:30 AM');
      console.log('Scheduled for after 9:30 AM');
      return;
    }

    // Check Firestore lock
    const todayStr = new Date().toISOString().split('T')[0];
    const schedulerLockDoc = await firestoreAdmin.collection('scheduler_locks').doc('report_reminder').get();
    const lockData = schedulerLockDoc.exists ? schedulerLockDoc.data() : null;

    if (lockData) {
      const lastRunDate = lockData.lastRunDate || '';
      const lastRunStatus = lockData.lastRunStatus || '';
      const lastRunTimestamp = lockData.lastRunTimestamp || '';

      let isStaleRunning = false;
      if (lastRunStatus === 'running' && lastRunTimestamp) {
        try {
          const startTime = new Date(lastRunTimestamp).getTime();
          const elapsedMs = Date.now() - startTime;
          if (elapsedMs > 5 * 60 * 1000) {
            isStaleRunning = true;
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }

      const alreadySentSuccessfully = lastRunDate === todayStr && (lastRunStatus === 'success' || lastRunStatus === 'partial_success');
      const isRunningRecently = lastRunDate === todayStr && lastRunStatus === 'running' && !isStaleRunning;

      if (alreadySentSuccessfully) {
        console.log('[DRY RUN] Would SKIP - already sent successfully today');
        console.log(`Last run: ${lastRunDate} at ${lastRunTimestamp}`);
        return;
      }

      if (isRunningRecently) {
        console.log('[DRY RUN] Would SKIP - already running today');
        return;
      }

      console.log(`[DRY RUN] Lock state: lastDate=${lastRunDate}, lastStatus=${lastRunStatus}`);
      console.log('[DRY RUN] Would PROCEED - not yet sent today\n');
    } else {
      console.log('[DRY RUN] No lock found - first run ever\n');
    }

    // Fetch settings
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData) {
      console.error('[DRY RUN] Failed to generate Google Sheets token');
      return;
    }

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const accessToken = tokenData.accessToken;
    const settingsRows = await fetchSheetValues(accessToken, spreadsheetId, 'settings!A:B');
    
    if (!settingsRows) {
      console.error('[DRY RUN] Failed to fetch settings sheet');
      return;
    }

    // Check if enabled
    const scheduledReportsEnabled = getSettingValue(settingsRows, 'email_enabled_scheduled_reports', 'true');
    if (scheduledReportsEnabled === 'false') {
      console.log('[DRY RUN] Would SKIP - email_enabled_scheduled_reports is disabled');
      return;
    }

    console.log('[DRY RUN] Scheduled reports are ENABLED\n');

    // Get team configs
    const configs = await getTeamReportConfigs();
    console.log(`Found ${configs.length} team report configurations\n`);

    // Get teams from Firestore
    const teamsSnapshot = await firestoreAdmin.collection('teams').get();
    const teamMap = new Map<string, string>();
    teamsSnapshot.forEach(doc => {
      const team = doc.data();
      if (team.Active !== false) {
        teamMap.set(doc.id, team.TeamName);
      }
    });

    // Get sub-teams from Firestore
    const subTeamsSnapshot = await firestoreAdmin.collection('sub_teams').get();
    const subTeamMap = new Map<string, { name: string; parentTeamId: string }>();
    subTeamsSnapshot.forEach(doc => {
      const subTeam = doc.data();
      subTeamMap.set(doc.id, {
        name: subTeam.SubTeamName,
        parentTeamId: subTeam.TeamID,
      });
    });

    // Process configurations
    const entitiesToRemind: TeamWithConfig[] = [];

    for (const config of configs) {
      if (!config.active) continue;
      if (config.reminderDay !== currentDay) continue;

      let teamName: string;
      let leaderEmails: string[] = [];

      if (config.entityType === 'subteam' && config.parentTeamId) {
        const subTeamInfo = subTeamMap.get(config.teamId);
        if (!subTeamInfo) {
          console.log(`[DRY RUN] Skipping sub-team ${config.teamId} - not found in Firestore`);
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
        console.log(`[DRY RUN] Skipping ${teamName} - no leaders or stakeholders configured`);
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

    console.log(`=== Emails that would be sent today (${currentDay}) ===\n`);

    const weekOf = getWeekOfDate(new Date());
    console.log(`Week of: ${weekOf}\n`);

    const sentTeams = new Set<string>();
    let totalEmails = 0;

    for (const entity of entitiesToRemind) {
      const recipients = getTeamRecipients(entity);
      console.log(`Team: ${entity.teamName} (ID: ${entity.teamId})`);
      console.log(`  Meeting Day: ${entity.meetingDay}`);
      console.log(`  Recipients (${recipients.length}): ${recipients.join(', ')}`);

      if (sentTeams.has(entity.teamId)) {
        console.log(`  [SKIPPED - already sent in this run]`);
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
      const templateName = isFirstTimeForTeam ? 'template_scheduled_report_first' : 'template_scheduled_report_reminder';
      
      console.log(`  Email Type: ${templateName}`);
      sentTeams.add(entity.teamId);
      totalEmails++;
      console.log('');
    }

    console.log(`=== Summary ===`);
    console.log(`Total emails that would be sent: ${totalEmails}`);
    console.log(`Total teams: ${entitiesToRemind.length}`);
    console.log(`Week of: ${weekOf}`);
    console.log('');
    console.log('[DRY RUN] No emails were actually sent. This was a simulation only.');

    process.exit(0);
  } catch (error) {
    console.error('Error in dry run:', error);
    process.exit(1);
  }
}

dryRunReportReminders();
