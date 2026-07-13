import 'dotenv/config';
import { generateGoogleSheetsToken, fetchSheetValues } from './services/googleSheetsService';
import { logger } from './utils/logger';

async function checkSettingsSheet() {
  try {
    console.log('=== Check Settings Sheet ===\n');

    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData) {
      console.error('❌ Failed to generate Google Sheets token');
      return;
    }

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    const accessToken = tokenData.accessToken;

    console.log('Fetching settings sheet...');
    const settingsRows = await fetchSheetValues(accessToken, spreadsheetId, 'settings!A:B');
    
    if (!settingsRows) {
      console.error('❌ Failed to fetch settings sheet');
      return;
    }

    console.log(`Found ${settingsRows.length} settings rows\n`);

    // Look for team leader and stakeholder patterns
    console.log('=== Team Leader Settings ===');
    console.log('================================');
    const leaderSettings = settingsRows.filter(row => row[0] && row[0].toString().includes('_leaders'));
    leaderSettings.forEach(row => {
      console.log(`${row[0]}: ${row[1]}`);
    });

    console.log('\n=== Stakeholder Settings ===');
    console.log('================================');
    const stakeholderSettings = settingsRows.filter(row => row[0] && row[0].toString().includes('stakeholder'));
    stakeholderSettings.forEach(row => {
      console.log(`${row[0]}: ${row[1]}`);
    });

    console.log('\n=== Sub-Team Leader Settings ===');
    console.log('================================');
    const subTeamLeaderSettings = settingsRows.filter(row => row[0] && row[0].toString().includes('subteam'));
    subTeamLeaderSettings.forEach(row => {
      console.log(`${row[0]}: ${row[1]}`);
    });

    // Specific checks for our configured entities
    console.log('\n=== Specific Entity Checks ===');
    
    const teamIds = ['T-263', 'T-267', 'T-3', 'T-5', 'T-7', 'T-706', 'T-739'];
    teamIds.forEach(teamId => {
      const leaderKey = `team_${teamId}_leaders`;
      const stakeholderKey = `team_${teamId}_stakeholders`;
      const leaderRow = settingsRows.find(row => row[0] === leaderKey);
      const stakeholderRow = settingsRows.find(row => row[0] === stakeholderKey);
      
      console.log(`\nTeam ${teamId}:`);
      console.log(`  Leaders: ${leaderRow ? leaderRow[1] : '(not found)'}`);
      console.log(`  Stakeholders: ${stakeholderRow ? stakeholderRow[1] : '(not found)'}`);
    });

    // Check sub-team patterns
    console.log('\n=== Sub-Team Pattern Checks ===');
    const subTeamIds = ['ST-T-6-1783488209444', 'ST-T-6-1783759220250']; // SST and Purchase
    subTeamIds.forEach(subTeamId => {
      const leaderKey = `team_T-6_subteam_${subTeamId}_leaders`;
      const leaderRow = settingsRows.find(row => row[0] === leaderKey);
      console.log(`\nSub-Team ${subTeamId}:`);
      console.log(`  Leaders: ${leaderRow ? leaderRow[1] : '(not found)'}`);
    });

  } catch (error) {
    console.error('Error checking settings sheet:', error);
    process.exit(1);
  }
}

checkSettingsSheet()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
