import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';

async function listTeams() {
  try {
    console.log('=== Listing Teams ===\n');
    
    const teamsSnapshot = await firestoreAdmin.collection('teams').get();
    console.log('Teams:');
    teamsSnapshot.forEach(doc => {
      const team = doc.data();
      console.log(`  ${team.TeamName} (ID: ${doc.id})`);
    });
    
    console.log('\n=== Listing Sub-Teams under E-Com ===\n');
    const eComSnapshot = await firestoreAdmin.collection('teams')
      .where('TeamName', '==', 'E-Com')
      .get();

    if (!eComSnapshot.empty) {
      const eComId = eComSnapshot.docs[0].id;
      const subTeamsSnapshot = await firestoreAdmin.collection('sub_teams')
        .where('TeamID', '==', eComId)
        .get();

      console.log('Sub-Teams:');
      subTeamsSnapshot.forEach(doc => {
        const subTeam = doc.data();
        console.log(`  ${subTeam.SubTeamName} (ID: ${doc.id})`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

listTeams();
