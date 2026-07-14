import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';
import { generateGoogleSheetsToken, fetchSheetValues } from './services/googleSheetsService';

async function checkTodaysEmails() {
  try {
    console.log('=== Checking who will get email today (July 14, 2026) ===\n');

    // Determine what day July 14, 2026 is
    const targetDate = new Date('2026-07-14');
    const tz = process.env.TZ || 'Asia/Kolkata';
    const options: Intl.DateTimeFormatOptions = { timeZone: tz, weekday: 'long' };
    const dayName = new Intl.DateTimeFormat('en-US', options).format(targetDate);
    
    console.log(`Target date: July 14, 2026`);
    console.log(`Day of week: ${dayName}\n`);

    // Fetch team report configurations from Firestore
    const configsSnapshot = await firestoreAdmin.collection('team_report_config').get();
    
    if (configsSnapshot.empty) {
      console.log('No team report configurations found');
      return;
    }

    console.log(`Found ${configsSnapshot.size} team report configurations\n`);

    // Filter configs for today's reminder day
    const todaysConfigs: any[] = [];
    configsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.active !== false && data.reminderDay === dayName) {
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
      console.log(`No teams configured to receive reminders on ${dayName}`);
      return;
    }

    console.log(`=== Teams scheduled for ${dayName} reminders ===\n`);

    // Fetch settings to get leader/stakeholder emails
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

    // Helper function to get setting value
    function getSettingValue(key: string, defaultValue: string): string {
      const row = settingsRows.find(r => r[0] === key);
      return row && row[1] !== undefined && row[1] !== null ? String(row[1]) : defaultValue;
    }

    // Get team leader emails
    function getTeamLeaderEmails(teamId: string): string[] {
      const leaderSettingKey = `team_${teamId}_leaders`;
      const leaderEmailsStr = getSettingValue(leaderSettingKey, '');
      if (!leaderEmailsStr) return [];
      return leaderEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
    }

    // Get team stakeholder emails
    function getTeamStakeholderEmails(teamId: string): string[] {
      const stakeholderSettingKey = `team_${teamId}_stakeholders`;
      const stakeholderEmailsStr = getSettingValue(stakeholderSettingKey, '');
      if (!stakeholderEmailsStr) return [];
      return stakeholderEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
    }

    // Get sub-team leader emails
    function getSubTeamLeaderEmails(teamId: string, subTeamId: string): string[] {
      const leaderSettingKey = `team_${teamId}_subteam_${subTeamId}_leaders`;
      const leaderEmailsStr = getSettingValue(leaderSettingKey, '');
      if (!leaderEmailsStr) return [];
      return leaderEmailsStr.split(',').map(e => e.trim()).filter(Boolean);
    }

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

    let totalRecipients = 0;

    for (const config of todaysConfigs) {
      let teamName: string;
      let leaderEmails: string[];
      let stakeholderEmails: string[] = [];

      if (config.entityType === 'subteam' && config.parentTeamId) {
        const subTeamInfo = subTeamMap.get(config.teamId);
        if (!subTeamInfo) {
          console.log(`⚠️  Sub-team ${config.teamId} not found in Firestore`);
          continue;
        }
        teamName = subTeamInfo.name;
        leaderEmails = getSubTeamLeaderEmails(config.parentTeamId, config.teamId);
        stakeholderEmails = [];
      } else {
        teamName = teamMap.get(config.teamId) || config.teamName;
        leaderEmails = getTeamLeaderEmails(config.teamId);
        stakeholderEmails = getTeamStakeholderEmails(config.teamId);
      }

      const allRecipients = [...new Set([...leaderEmails, ...stakeholderEmails].map(e => e.toLowerCase()))];

      console.log(`📧 Team: ${teamName} (${config.teamId})`);
      console.log(`   Type: ${config.entityType}`);
      console.log(`   Meeting Day: ${config.meetingDay}`);
      console.log(`   Leaders (${leaderEmails.length}): ${leaderEmails.join(', ') || 'None'}`);
      console.log(`   Stakeholders (${stakeholderEmails.length}): ${stakeholderEmails.join(', ') || 'None'}`);
      console.log(`   Total Recipients: ${allRecipients.length}`);
      console.log(`   Recipients: ${allRecipients.join(', ')}`);
      console.log('');
      
      totalRecipients += allRecipients.length;
    }

    console.log(`=== Summary ===`);
    console.log(`Teams scheduled: ${todaysConfigs.length}`);
    console.log(`Total email recipients: ${totalRecipients}`);
    console.log(`Scheduled time: 9:30 AM IST (${tz})`);

  } catch (error) {
    console.error('Error checking today\'s emails:', error);
    process.exit(1);
  }
}

checkTodaysEmails()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
