import { getTeamReportConfigs } from './server/services/teamReportConfigService';

async function checkConfigs() {
  try {
    const configs = await getTeamReportConfigs();
    console.log('=== Team Report Configurations ===\n');
    
    const currentDay = 'Monday'; // Today is Monday based on time check
    
    for (const config of configs) {
      if (config.active && config.reminderDay === currentDay) {
        console.log(`Team: ${config.teamName} (ID: ${config.teamId})`);
        console.log(`  Type: ${config.entityType}`);
        console.log(`  Reminder Day: ${config.reminderDay}`);
        console.log(`  Meeting Day: ${config.meetingDay}`);
        console.log(`  Parent Team ID: ${config.parentTeamId || 'N/A'}`);
        console.log('');
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkConfigs();
