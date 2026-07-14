import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';
import { generateGoogleSheetsToken, fetchSheetValues, updateSheetValues } from './services/googleSheetsService';

async function clearEcomReferences() {
  try {
    console.log('=== Clearing E-Com References from Users ===\n');
    
    const usersSnapshot = await firestoreAdmin.collection('users').get();
    const usersWithEcom = [];

    usersSnapshot.forEach(doc => {
      const user = doc.data();
      const teamNames = user.TeamNames || [];
      
      const hasEcomName = teamNames.some((name: string) => 
        name.toLowerCase().includes('e-com') || name.toLowerCase() === 'e-com' || name === 'E-Com'
      );
      
      if (hasEcomName) {
        usersWithEcom.push({
          email: doc.id,
          fullName: user.FullName,
          teamNames: teamNames,
          teamIds: user.TeamIDs || []
        });
      }
    });

    console.log(`Found ${usersWithEcom.length} users with E-Com references\n`);

    // Get Google Sheets data
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      console.error('Failed to get Google Sheets token');
      return;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const usersRange = 'users!A:R';
    const users = await fetchSheetValues(tokenData.accessToken, spreadsheetId, usersRange);

    if (!users || users.length === 0) {
      console.error('Failed to fetch users from Sheets');
      return;
    }

    console.log(`Found ${users.length - 1} user rows in Sheets\n`);

    // Clear E-Com references
    let firestoreCount = 0;
    let sheetsCount = 0;

    for (const user of usersWithEcom) {
      // Update Firestore
      try {
        await firestoreAdmin.collection('users').doc(user.email).update({
          TeamNames: [],
          TeamIDs: []
        });
        console.log(`✓ Cleared Firestore: ${user.fullName} (${user.email})`);
        firestoreCount++;
      } catch (error) {
        console.error(`✗ Failed to clear Firestore for ${user.email}:`, error);
      }

      // Update Google Sheets
      for (let i = 1; i < users.length; i++) {
        const rowEmail = (users[i][2] || '').trim().toLowerCase();
        if (rowEmail === user.email.toLowerCase()) {
          const fixedRow = [...users[i]];
          fixedRow[5] = ''; // TeamID
          fixedRow[6] = ''; // TeamName
          
          const range = `users!A${i + 1}:R${i + 1}`;
          const success = await updateSheetValues(
            tokenData.accessToken,
            spreadsheetId,
            range,
            [fixedRow]
          );

          if (success) {
            console.log(`✓ Cleared Sheets row ${i + 1}: ${user.fullName}`);
            sheetsCount++;
          } else {
            console.error(`✗ Failed to clear Sheets row ${i + 1}`);
          }
          break;
        }
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Firestore: ${firestoreCount} users updated`);
    console.log(`Sheets: ${sheetsCount} rows updated`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

clearEcomReferences();
