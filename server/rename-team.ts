import 'dotenv/config';
import { firestoreAdmin } from './services/firebaseAdmin';

async function renameTeam() {
  try {
    console.log('=== Rename Team ===\n');

    const teamId = 'T-263';
    const newName = 'Expansion';

    console.log(`Renaming team ${teamId} to "${newName}"...`);

    const teamRef = firestoreAdmin.collection('teams').doc(teamId);
    await teamRef.update({
      TeamName: newName,
      UpdatedAt: new Date().toISOString(),
    });

    console.log(`✅ Team renamed successfully to "${newName}"`);

  } catch (error) {
    console.error('Error renaming team:', error);
    process.exit(1);
  }
}

renameTeam()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
