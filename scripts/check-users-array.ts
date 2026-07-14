/**
 * scripts/check-users-array.ts
 *
 * Diagnostic script to check the users array loaded from Firestore/Sheets for duplicates.
 * This helps identify if the issue is in data loading vs UI rendering.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from '../server/services/firebaseAdmin';
import { generateGoogleSheetsToken, fetchSheetValues } from '../server/services/googleSheetsService';

interface User {
  UserID: string;
  FullName: string;
  Email: string;
  Role: string;
  ManagerEmail: string;
  TeamIDs: string[];
  TeamNames: string[];
  Active: boolean;
  CreatedAt: string;
  UpdatedAt: string;
}

async function main() {
  console.log('=== Checking Users Array for Duplicates ===\n');

  // Check Firestore
  console.log('--- Firestore Users ---');
  try {
    const firestoreSnapshot = await firestoreAdmin.collection('users').get();
    const firestoreUsers: User[] = [];
    
    firestoreSnapshot.forEach(doc => {
      const data = doc.data() as any;
      firestoreUsers.push({
        UserID: data.UserID || doc.id,
        FullName: data.FullName || '',
        Email: data.Email || '',
        Role: data.Role || '',
        ManagerEmail: data.ManagerEmail || '',
        TeamIDs: data.TeamIDs || [],
        TeamNames: data.TeamNames || [],
        Active: data.Active ?? true,
        CreatedAt: data.CreatedAt || '',
        UpdatedAt: data.UpdatedAt || ''
      });
    });

    console.log(`Total Firestore users: ${firestoreUsers.length}`);

    // Check for duplicate emails in Firestore
    const emailMap = new Map<string, User[]>();
    firestoreUsers.forEach(user => {
      const email = user.Email.toLowerCase();
      if (!emailMap.has(email)) {
        emailMap.set(email, []);
      }
      emailMap.get(email)!.push(user);
    });

    const duplicateEmails = Array.from(emailMap.entries()).filter(([_, users]) => users.length > 1);
    
    if (duplicateEmails.length > 0) {
      console.log(`\n⚠️  Found ${duplicateEmails.length} duplicate emails in Firestore:`);
      duplicateEmails.forEach(([email, users]) => {
        console.log(`  - ${email}: ${users.length} entries`);
        users.forEach((u, i) => {
          console.log(`    Entry ${i + 1}: UserID=${u.UserID}, FullName=${u.FullName}`);
        });
      });
    } else {
      console.log('✓ No duplicate emails found in Firestore');
    }

    // Check for duplicate UserIDs in Firestore
    const userIdMap = new Map<string, User[]>();
    firestoreUsers.forEach(user => {
      const userId = user.UserID;
      if (!userIdMap.has(userId)) {
        userIdMap.set(userId, []);
      }
      userIdMap.get(userId)!.push(user);
    });

    const duplicateUserIds = Array.from(userIdMap.entries()).filter(([_, users]) => users.length > 1);
    
    if (duplicateUserIds.length > 0) {
      console.log(`\n⚠️  Found ${duplicateUserIds.length} duplicate UserIDs in Firestore:`);
      duplicateUserIds.forEach(([userId, users]) => {
        console.log(`  - ${userId}: ${users.length} entries`);
        users.forEach((u, i) => {
          console.log(`    Entry ${i + 1}: Email=${u.Email}, FullName=${u.FullName}`);
        });
      });
    } else {
      console.log('✓ No duplicate UserIDs found in Firestore');
    }

    // Check for Bhola specifically
    const bholaUsers = firestoreUsers.filter(u => u.Email.toLowerCase() === 'bhola.upadhyay@pw.live');
    console.log(`\n--- Bhola Upadhyay in Firestore ---`);
    console.log(`Found ${bholaUsers.length} entries`);
    bholaUsers.forEach((u, i) => {
      console.log(`Entry ${i + 1}:`);
      console.log(`  UserID: ${u.UserID}`);
      console.log(`  FullName: ${u.FullName}`);
      console.log(`  Email: ${u.Email}`);
      console.log(`  Role: ${u.Role}`);
      console.log(`  TeamIDs: ${u.TeamIDs.join(', ')}`);
      console.log(`  TeamNames: ${u.TeamNames.join(', ')}`);
      console.log(`  ManagerEmail: ${u.ManagerEmail}`);
      console.log(`  CreatedAt: ${u.CreatedAt}`);
      console.log(`  UpdatedAt: ${u.UpdatedAt}`);
    });

  } catch (error) {
    console.error('Error checking Firestore:', error);
  }

  // Check Google Sheets
  console.log('\n--- Google Sheets Users ---');
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      console.error('Failed to authenticate with Google Sheets');
      return;
    }

    const { accessToken, spreadsheetId } = tokenData;
    const rows = await fetchSheetValues(accessToken, spreadsheetId, 'users!A:Z');
    
    if (!rows || rows.length < 2) {
      console.log('No user rows found in Sheets');
      return;
    }

    const header = rows[0];
    const dataRows = rows.slice(1);
    const sheetsUsers: User[] = [];

    dataRows.forEach((row, i) => {
      const email = (row[2] || '').toLowerCase().trim();
      if (email) {
        sheetsUsers.push({
          UserID: row[0] || '',
          FullName: row[1] || '',
          Email: email,
          Role: row[3] || '',
          ManagerEmail: (row[4] || '').toLowerCase().trim(),
          TeamIDs: row[5] ? [row[5]] : [],
          TeamNames: row[6] ? [row[6]] : [],
          Active: (row[7] || '').toLowerCase() === 'yes',
          CreatedAt: row[10] || '',
          UpdatedAt: row[11] || ''
        });
      }
    });

    console.log(`Total Sheets users: ${sheetsUsers.length}`);

    // Check for duplicate emails in Sheets
    const sheetsEmailMap = new Map<string, User[]>();
    sheetsUsers.forEach(user => {
      const email = user.Email.toLowerCase();
      if (!sheetsEmailMap.has(email)) {
        sheetsEmailMap.set(email, []);
      }
      sheetsEmailMap.get(email)!.push(user);
    });

    const sheetsDuplicateEmails = Array.from(sheetsEmailMap.entries()).filter(([_, users]) => users.length > 1);
    
    if (sheetsDuplicateEmails.length > 0) {
      console.log(`\n⚠️  Found ${sheetsDuplicateEmails.length} duplicate emails in Sheets:`);
      sheetsDuplicateEmails.forEach(([email, users]) => {
        console.log(`  - ${email}: ${users.length} entries`);
        users.forEach((u, i) => {
          console.log(`    Entry ${i + 1}: UserID=${u.UserID}, FullName=${u.FullName}, Row=${i + 2}`);
        });
      });
    } else {
      console.log('✓ No duplicate emails found in Sheets');
    }

    // Check for Bhola specifically in Sheets
    const bholaSheetsUsers = sheetsUsers.filter(u => u.Email.toLowerCase() === 'bhola.upadhyay@pw.live');
    console.log(`\n--- Bhola Upadhyay in Sheets ---`);
    console.log(`Found ${bholaSheetsUsers.length} entries`);
    bholaSheetsUsers.forEach((u, i) => {
      console.log(`Entry ${i + 1}:`);
      console.log(`  UserID: ${u.UserID}`);
      console.log(`  FullName: ${u.FullName}`);
      console.log(`  Email: ${u.Email}`);
      console.log(`  Role: ${u.Role}`);
      console.log(`  TeamIDs: ${u.TeamIDs.join(', ')}`);
      console.log(`  TeamNames: ${u.TeamNames.join(', ')}`);
      console.log(`  ManagerEmail: ${u.ManagerEmail}`);
      console.log(`  CreatedAt: ${u.CreatedAt}`);
      console.log(`  UpdatedAt: ${u.UpdatedAt}`);
    });

  } catch (error) {
    console.error('Error checking Sheets:', error);
  }

  console.log('\n=== Summary ===');
  console.log('If no duplicates found in Firestore or Sheets, the issue is likely in:');
  console.log('1. UI rendering logic (React component re-rendering)');
  console.log('2. Data merging/sync logic between Firestore and Sheets');
  console.log('3. Client-side state management (useState/setUsers)');
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
