import 'dotenv/config';
import { firestoreAdmin } from './services/firebaseAdmin';

async function checkSubTeamFields() {
  try {
    console.log('=== Check Sub-Team Document Fields ===\n');

    // Get E-Com team ID
    const eComSnapshot = await firestoreAdmin.collection('teams')
      .where('TeamName', '==', 'E-Com')
      .get();

    if (eComSnapshot.empty) {
      console.log('❌ E-Com team not found');
      return;
    }

    const eComId = eComSnapshot.docs[0].id;
    console.log(`✅ Found E-Com team: ${eComId}\n`);

    // Fetch sub-teams under E-Com
    const subTeamsSnapshot = await firestoreAdmin.collection('sub_teams')
      .where('TeamID', '==', eComId)
      .limit(1)
      .get();

    if (subTeamsSnapshot.empty) {
      console.log('❌ No sub-teams found');
      return;
    }

    const subTeamDoc = subTeamsSnapshot.docs[0];
    const subTeamData = subTeamDoc.data();

    console.log('Sample Sub-Team Document:');
    console.log('=========================');
    console.log(`Sub-Team ID: ${subTeamDoc.id}`);
    console.log('All fields:');
    Object.keys(subTeamData).forEach(key => {
      const value = subTeamData[key];
      if (Array.isArray(value)) {
        console.log(`  ${key}: [${value.length} items] ${JSON.stringify(value)}`);
      } else if (typeof value === 'object') {
        console.log(`  ${key}: ${JSON.stringify(value)}`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });

  } catch (error) {
    console.error('Error checking sub-team fields:', error);
    process.exit(1);
  }
}

checkSubTeamFields()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
