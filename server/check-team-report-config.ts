import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';

async function checkTeamReportConfig() {
  try {
    console.log('=== Checking team_report_config Collection ===\n');

    const snapshot = await firestoreAdmin.collection('team_report_config').get();
    
    console.log(`Found ${snapshot.size} documents in team_report_config\n`);
    
    if (snapshot.empty) {
      console.log('❌ Collection is empty - this is the problem!');
      return;
    }

    console.log('=== Raw team_report_config Data ===');
    console.log('=====================================\n');
    
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`Document ID: ${doc.id}`);
      console.log(`  teamId: ${data.teamId}`);
      console.log(`  teamName: ${data.teamName}`);
      console.log(`  entityType: ${data.entityType}`);
      console.log(`  parentTeamId: ${data.parentTeamId || 'N/A'}`);
      console.log(`  reminderDay: ${data.reminderDay}`);
      console.log(`  meetingDay: ${data.meetingDay}`);
      console.log(`  active: ${data.active}`);
      console.log(`  createdAt: ${data.createdAt}`);
      console.log(`  updatedAt: ${data.updatedAt}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error checking team_report_config:', error);
    process.exit(1);
  }
}

checkTeamReportConfig()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
