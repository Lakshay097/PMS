import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';

async function verifyConfig() {
  try {
    console.log('=== Verifying Team Report Configuration in Firestore ===\n');

    const snapshot = await firestoreAdmin.collection('team_report_config').get();
    
    if (snapshot.empty) {
      console.log('No configurations found in team_report_config collection.');
      process.exit(0);
    }

    console.log(`Found ${snapshot.size} configurations:\n`);

    snapshot.forEach(doc => {
      const config = doc.data();
      console.log(`${config.teamName} (${config.teamId})`);
      console.log(`  Type: ${config.entityType}`);
      console.log(`  Reminder Day: ${config.reminderDay}`);
      console.log(`  Meeting Day: ${config.meetingDay}`);
      console.log(`  Active: ${config.active}`);
      if (config.parentTeamId) {
        console.log(`  Parent Team ID: ${config.parentTeamId}`);
      }
      console.log('');
    });

    console.log('=== Verification Complete ===');
    process.exit(0);
  } catch (error) {
    console.error('Error verifying config:', error);
    process.exit(1);
  }
}

verifyConfig();
