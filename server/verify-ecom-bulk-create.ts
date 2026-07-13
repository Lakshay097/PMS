import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';
import { generateGoogleSheetsToken, fetchSheetValues } from './services/googleSheetsService';

async function verifyEcomBulkCreate() {
  try {
    console.log('=== Verifying E-Com Bulk User Creation ===\n');

    // Fetch from Firestore first (doesn't need Google Sheets)
    console.log('=== Verifying from Firestore ===');
    const usersSnapshot = await firestoreAdmin.collection('users')
      .where('TeamIDs', 'array-contains', 'T-6')
      .get();

    const ecomCountFromFirestore = usersSnapshot.size;
    const firestoreUsers: any[] = [];
    const recentEcomUsers: any[] = [];

    const now = new Date();

    usersSnapshot.forEach(doc => {
      const user = doc.data();
      const userData = {
        email: user.Email,
        fullName: user.FullName,
        role: user.Role,
        teamId: user.TeamID,
        teamName: user.TeamName,
        createdAt: user.CreatedAt
      };
      firestoreUsers.push(userData);
      
      // Track recent users (last 24 hours)
      if (user.CreatedAt) {
        const createdDate = new Date(user.CreatedAt);
        const diffHours = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
        if (diffHours < 24) {
          recentEcomUsers.push(userData);
        }
      }
    });

    console.log(`Total E-Com members from Firestore: ${ecomCountFromFirestore}`);
    console.log(`Recent additions (last 24 hours): ${recentEcomUsers.length}\n`);

    if (recentEcomUsers.length > 0) {
      console.log('=== Recently Added E-Com Users (Last 24 Hours) ===');
      recentEcomUsers.forEach(user => {
        console.log(`- ${user.fullName} (${user.email})`);
        console.log(`  Role: ${user.role}`);
        console.log(`  Team: ${user.teamName} (${user.teamId})`);
        console.log(`  Created: ${user.createdAt}`);
        console.log('');
      });
    }

    // Spot-check roles
    console.log('=== Role Spot-Check (First 10 from Firestore) ===');
    firestoreUsers.slice(0, 10).forEach(user => {
      console.log(`- ${user.fullName} (${user.email})`);
      console.log(`  Role: ${user.role}`);
      console.log('');
    });

    // Count by role
    const roleCounts: Record<string, number> = {};
    firestoreUsers.forEach(user => {
      const role = user.role || 'Unknown';
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    });

    console.log('=== Role Distribution in E-Com ===');
    Object.entries(roleCounts).forEach(([role, count]) => {
      console.log(`  ${role}: ${count}`);
    });

    // Try Google Sheets (may fail if credentials issue)
    console.log('\n=== Attempting Google Sheets Verification ===');
    const tokenData = await generateGoogleSheetsToken();
    let ecomCountFromSheets = 0;
    
    if (!tokenData) {
      console.log('⚠️  Could not verify from Google Sheets (credentials issue)');
      console.log('Proceeding with Firestore data only...\n');
    } else {
      const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
      const accessToken = tokenData.accessToken;

      // Fetch users sheet
      console.log('Fetching users sheet...');
      const usersSheet = await fetchSheetValues(accessToken, spreadsheetId!, 'users!A:R');
      if (!usersSheet) {
        console.log('⚠️  Failed to fetch users sheet');
      } else {
        console.log(`✅ Loaded ${usersSheet.length} rows from users sheet\n`);

        // Count E-Com team members from sheets
        for (let i = 1; i < usersSheet.length; i++) {
          const row = usersSheet[i];
          const teamId = row[5] || '';
          const teamName = row[6] || '';

          if (teamId === 'T-6' || teamName.toLowerCase() === 'e-com') {
            ecomCountFromSheets++;
          }
        }

        console.log(`=== E-Com Team Members from Sheets ===`);
        console.log(`Total E-Com members: ${ecomCountFromSheets}\n`);
      }
    }

    console.log('=== Verification Summary ===');
    console.log(`E-Com members from Sheets: ${ecomCountFromSheets}`);
    console.log(`E-Com members from Firestore: ${ecomCountFromFirestore}`);
    console.log(`Recent additions (last 24h): ${recentEcomUsers.length}`);
    if (ecomCountFromSheets > 0) {
      console.log(`Match: ${ecomCountFromSheets === ecomCountFromFirestore ? '✅' : '❌'}`);
    }

  } catch (error) {
    console.error('Error in verifyEcomBulkCreate:', error);
    process.exit(1);
  }
}

verifyEcomBulkCreate()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
