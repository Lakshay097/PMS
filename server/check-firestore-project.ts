import 'dotenv/config';
import { firestoreAdmin } from './services/firebaseAdmin';

async function checkFirestoreProject() {
  try {
    console.log('=== Firestore Project Check ===\n');
    
    console.log('Environment Variables:');
    console.log(`FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID}`);
    console.log(`FIREBASE_ADMIN_CLIENT_EMAIL: ${process.env.FIREBASE_ADMIN_CLIENT_EMAIL}`);
    console.log('');

    console.log('Firestore Admin initialized successfully');
    console.log('');

    // Test connection by fetching a sample
    const teamsSnapshot = await firestoreAdmin.collection('teams').limit(1).get();
    console.log(`Connection test: Found ${teamsSnapshot.size} team(s) in 'teams' collection`);
    
    if (teamsSnapshot.size > 0) {
      const sampleDoc = teamsSnapshot.docs[0];
      console.log(`Sample team ID: ${sampleDoc.id}`);
      console.log(`Sample team name: ${sampleDoc.data().TeamName}`);
    }

  } catch (error) {
    console.error('Error checking Firestore project:', error);
    process.exit(1);
  }
}

checkFirestoreProject()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
