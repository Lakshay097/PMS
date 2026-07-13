import { getTeamReportConfigs } from './services/teamReportConfigService';
import { logger } from './utils/logger';

async function fetchTeamReportConfig() {
  try {
    console.log('=== Fetching Team Report Configuration ===\n');

    const configs = await getTeamReportConfigs();
    
    console.log(`Found ${configs.length} team configurations:\n`);
    console.log('team_id | team_name | reminder_day | meeting_day | active | updated_at');
    console.log('--------|-----------|--------------|-------------|-------|-------------');
    
    configs.forEach(config => {
      console.log(`${config.teamId} | ${config.teamName} | ${config.reminderDay} | ${config.meetingDay} | ${config.active} | ${config.updatedAt}`);
    });

    console.log('\n=== End of Configuration ===');

  } catch (error) {
    console.error('Error in fetchTeamReportConfig:', error);
    process.exit(1);
  }
}

fetchTeamReportConfig()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
