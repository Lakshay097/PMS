import 'dotenv/config';
import { firestoreAdmin } from './services/firebaseAdmin';

async function checkSubTeams() {
  try {
    console.log('=== Check Sub-Teams under E-Com ===\n');

    // Get E-Com team ID
    const eComSnapshot = await firestoreAdmin.collection('teams')
      .where('TeamName', '==', 'E-Com')
      .get();

    if (eComSnapshot.empty) {
      console.log('❌ E-Com team not found');
      return;
    }

    const eComDoc = eComSnapshot.docs[0];
    const eComId = eComDoc.id;
    console.log(`✅ Found E-Com team: ${eComId}\n`);

    // Fetch sub-teams under E-Com - try different collection names
    console.log('Trying collection: subTeams...');
    let subTeamsSnapshot = await firestoreAdmin.collection('subTeams')
      .where('TeamID', '==', eComId)
      .get();

    if (subTeamsSnapshot.empty) {
      console.log('Trying collection: sub_teams...');
      subTeamsSnapshot = await firestoreAdmin.collection('sub_teams')
        .where('TeamID', '==', eComId)
        .get();
    }

    if (subTeamsSnapshot.empty) {
      console.log('Trying collection: SubTeams...');
      subTeamsSnapshot = await firestoreAdmin.collection('SubTeams')
        .where('TeamID', '==', eComId)
        .get();
    }

    console.log(`Found ${subTeamsSnapshot.size} sub-teams under E-Com:\n`);

    subTeamsSnapshot.forEach(doc => {
      const subTeam = doc.data();
      console.log(`Sub-Team ID: ${doc.id}`);
      console.log(`  Name: ${subTeam.SubTeamName}`);
      console.log(`  TeamID: ${subTeam.TeamID}`);
      console.log(`  SubTeamLeaderEmails: ${subTeam.SubTeamLeaderEmails?.length || 0} emails`);
      if (subTeam.SubTeamLeaderEmails && subTeam.SubTeamLeaderEmails.length > 0) {
        subTeam.SubTeamLeaderEmails.forEach((email: string) => console.log(`    - ${email}`));
      }
      console.log('');
    });

  } catch (error) {
    console.error('Error checking sub-teams:', error);
    process.exit(1);
  }
}

checkSubTeams()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
