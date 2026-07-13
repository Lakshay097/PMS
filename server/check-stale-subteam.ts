import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';

async function checkStaleSubTeam() {
  try {
    console.log('=== Check Stale Sub-Team Entry ===\n');

    const staleSubTeamId = 'ST-T-6-1783246543526';
    console.log(`Checking for sub-team ID: ${staleSubTeamId}\n`);

    // Check if this sub-team exists in Firestore
    const subTeamDoc = await firestoreAdmin.collection('sub_teams').doc(staleSubTeamId).get();
    
    if (subTeamDoc.exists) {
      const subTeamData = subTeamDoc.data();
      console.log('✅ Sub-team EXISTS in Firestore:');
      console.log(`  SubTeamID: ${staleSubTeamId}`);
      console.log(`  SubTeamName: ${subTeamData.SubTeamName}`);
      console.log(`  TeamID: ${subTeamData.TeamID}`);
      console.log(`  Active: ${subTeamData.Active}`);
      console.log(`  CreatedAt: ${subTeamData.CreatedAt}`);
      console.log(`  UpdatedAt: ${subTeamData.UpdatedAt}`);
    } else {
      console.log('❌ Sub-team NOT FOUND in Firestore');
      console.log('This entry is stale and should be cleaned up from the settings sheet.');
    }

    // Also check all sub-teams under E-Com for comparison
    console.log('\n=== All Current Sub-Teams under E-Com ===');
    const eComSnapshot = await firestoreAdmin.collection('teams')
      .where('TeamName', '==', 'E-Com')
      .get();

    if (!eComSnapshot.empty) {
      const eComId = eComSnapshot.docs[0].id;
      const subTeamsSnapshot = await firestoreAdmin.collection('sub_teams')
        .where('TeamID', '==', eComId)
        .get();

      console.log(`Found ${subTeamsSnapshot.size} sub-teams under E-Com:\n`);
      subTeamsSnapshot.forEach(doc => {
        const subTeam = doc.data();
        console.log(`  ${subTeam.SubTeamName} (${doc.id})`);
      });
    }

  } catch (error) {
    console.error('Error checking stale sub-team:', error);
    process.exit(1);
  }
}

checkStaleSubTeam()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
