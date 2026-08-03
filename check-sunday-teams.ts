import { firestoreAdmin } from './server/services/firebaseAdmin';
import { getTeamReportConfigs } from './server/services/teamReportConfigService';

async function checkSundayTeams() {
  const configs = await getTeamReportConfigs();
  const sundayTeams = configs.filter(c => c.active && c.reminderDay === 'Sunday');
  
  console.log('Teams scheduled for Sunday reminders:');
  if (sundayTeams.length > 0) {
    for (const team of sundayTeams) {
      console.log(`  - ${team.teamName} (ID: ${team.teamId})`);
      console.log(`    Timezone: ${team.timezone}`);
      console.log(`    Reminder time: ${team.reminderTime}`);
    }
  } else {
    console.log('  No teams scheduled for Sunday');
  }
}

checkSundayTeams().catch(console.error);
