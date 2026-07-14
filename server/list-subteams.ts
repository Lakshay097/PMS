import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';

async function listSubTeams() {
  try {
    console.log('=== Listing All Sub-Teams ===\n');
    
    const subTeamsSnapshot = await firestoreAdmin.collection('sub_teams').get();
    console.log('Sub-Teams:');
    subTeamsSnapshot.forEach(doc => {
      const subTeam = doc.data();
      console.log(`  ${subTeam.SubTeamName} (ID: ${doc.id}, Parent: ${subTeam.TeamID})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

listSubTeams();
