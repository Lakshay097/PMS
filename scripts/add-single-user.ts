import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from '../server/services/firebaseAdmin';
import { generateGoogleSheetsToken, fetchSheetValues, updateSheetValues, appendSheetValues } from '../server/services/googleSheetsService';

interface UserData {
  name: string;
  email: string;
  managerEmail: string;
  teamId: string;
  teamName: string;
}

async function addSingleUser(userData: UserData) {
  try {
    console.log('=== Adding Single User to System ===\n');
    console.log(`Name: ${userData.name}`);
    console.log(`Email: ${userData.email}`);
    console.log(`Manager: ${userData.managerEmail}`);
    console.log(`Team: ${userData.teamName} (${userData.teamId})\n`);

    // Step 1: Check if user exists in Google Sheets
    console.log('Step 1: Checking Google Sheets for existing user...');
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      console.error('Failed to get Google Sheets token');
      return;
    }

    const sheetRows = await fetchSheetValues(tokenData.accessToken, tokenData.spreadsheetId, 'users!A:Z');
    console.log(`Loaded ${sheetRows.length} rows from users sheet`);

    // Find user by email
    let existingRowIndex = -1;
    for (let i = 1; i < sheetRows.length; i++) {
      const email = (sheetRows[i][2] || '').trim().toLowerCase();
      if (email === userData.email.toLowerCase()) {
        existingRowIndex = i;
        break;
      }
    }

    if (existingRowIndex >= 0) {
      console.log(`User found in Google Sheets at row ${existingRowIndex + 1}`);
      console.log('Updating existing user...');

      // Update existing user in Sheets
      const sheetRow = existingRowIndex + 1;
      const success = await updateSheetValues(
        tokenData.accessToken,
        tokenData.spreadsheetId,
        `users!E${sheetRow}:G${sheetRow}`,
        [[userData.managerEmail, userData.teamId, userData.teamName]]
      );

      if (success) {
        console.log('✓ Updated Google Sheets');
      } else {
        console.error('✗ Failed to update Google Sheets');
      }
    } else {
      console.log('User not found in Google Sheets');
      console.log('Adding new user to Google Sheets...');

      // Get the next UserID
      const maxUserId = sheetRows.length > 0 ? sheetRows.length : 0;
      const newUserId = (maxUserId + 1).toString();

      // Add new row to Google Sheets
      // Schema: UserID, FullName, Email, Role, ManagerEmail, TeamID, TeamName, Active, ...
      const newRow = [
        newUserId,
        userData.name,
        userData.email,
        '', // Role - empty for now
        userData.managerEmail,
        userData.teamId,
        userData.teamName,
        'Yes' // Active
      ];

      const success = await appendSheetValues(tokenData.accessToken, tokenData.spreadsheetId, 'users!A:H', [newRow]);

      if (success) {
        console.log('✓ Added new user to Google Sheets');
      } else {
        console.error('✗ Failed to add user to Google Sheets');
      }
    }

    // Step 2: Update Firestore if user exists, create if not
    console.log('\nStep 2: Checking Firestore for existing user...');
    const userDoc = await firestoreAdmin.collection('users').doc(userData.email).get();

    if (userDoc.exists) {
      console.log('User found in Firestore');
      console.log('Updating user in Firestore...');

      await firestoreAdmin.collection('users').doc(userData.email).update({
        TeamIDs: [userData.teamId],
        TeamNames: [userData.teamName],
        ManagerEmail: userData.managerEmail,
        UpdatedAt: new Date().toISOString()
      });

      console.log('✓ Updated Firestore');
    } else {
      console.log('User not found in Firestore');
      console.log('Creating new user in Firestore...');

      await firestoreAdmin.collection('users').doc(userData.email).set({
        UserID: userData.email,
        FullName: userData.name,
        Email: userData.email,
        Role: '',
        ManagerEmail: userData.managerEmail,
        TeamIDs: [userData.teamId],
        TeamNames: [userData.teamName],
        Active: true,
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString()
      });

      console.log('✓ Created new user in Firestore');
    }

    console.log('\n=== Summary ===');
    console.log('User successfully added to both Google Sheets and Firestore');
    console.log('The user can now register through the application using their email');

  } catch (error) {
    console.error('Error adding user:', error);
    process.exit(1);
  }
}

// Add Atif Khan to ECOM - SST team
const userData: UserData = {
  name: 'Atif Khan',
  email: 'atif.khan@finz.club',
  managerEmail: 'rajeev.1@pw.live',
  teamId: 'T-6', // ECOM team ID from bulk-add script
  teamName: 'e-com'
};

addSingleUser(userData)
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
