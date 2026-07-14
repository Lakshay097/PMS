import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';

async function checkEcomReferences() {
  try {
    console.log('=== Checking for E-Com Team ===\n');
    
    const eComSnapshot = await firestoreAdmin.collection('teams')
      .where('TeamName', '==', 'E-Com')
      .get();

    if (eComSnapshot.empty) {
      console.log('✓ No "E-Com" team found in teams collection');
    } else {
      console.log('✗ Found "E-Com" team:');
      eComSnapshot.docs.forEach(doc => {
        const team = doc.data();
        console.log(`  ${team.TeamName} (ID: ${doc.id})`);
      });
    }

    console.log('\n=== Checking Users with E-Com References ===\n');
    
    const usersSnapshot = await firestoreAdmin.collection('users').get();
    const usersWithEcom = [];

    usersSnapshot.forEach(doc => {
      const user = doc.data();
      const teamNames = user.TeamNames || [];
      const teamIds = user.TeamIDs || [];
      
      const hasEcomName = teamNames.some((name: string) => 
        name.toLowerCase().includes('e-com') || name.toLowerCase() === 'e-com' || name === 'E-Com'
      );
      
      if (hasEcomName) {
        usersWithEcom.push({
          email: doc.id,
          fullName: user.FullName,
          teamNames: teamNames,
          teamIds: teamIds
        });
      }
    });

    if (usersWithEcom.length === 0) {
      console.log('✓ No users found with E-Com team references');
    } else {
      console.log(`✗ Found ${usersWithEcom.length} users with E-Com references:\n`);
      usersWithEcom.forEach(user => {
        console.log(`  ${user.fullName} (${user.email})`);
        console.log(`    TeamNames: ${JSON.stringify(user.teamNames)}`);
        console.log(`    TeamIDs: ${JSON.stringify(user.teamIds)}`);
        console.log();
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkEcomReferences();
