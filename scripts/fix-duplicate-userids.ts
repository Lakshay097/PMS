/**
 * scripts/fix-duplicate-userids.ts
 *
 * Script to fix duplicate UserIDs in Firestore.
 * Found: UserID USR-156 is assigned to both Bhola Upadhyay and Lakshay kumar
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from '../server/services/firebaseAdmin';
import { generateGoogleSheetsToken, fetchSheetValues, updateSheetValues } from '../server/services/googleSheetsService';

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
  console.log('=== Fixing Duplicate UserIDs ===\n');

  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const dryRun = !execute;

  if (dryRun) {
    console.log('DRY RUN MODE - No changes will be made');
    console.log('Run with --execute to apply fixes\n');
  } else {
    console.log('EXECUTE MODE - Changes will be applied\n');
  }

  // Get all users from Firestore
  console.log('Fetching users from Firestore...');
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

  console.log(`Total Firestore users: ${firestoreUsers.length}\n`);

  // Find duplicate UserIDs
  const userIdMap = new Map<string, User[]>();
  firestoreUsers.forEach(user => {
    const userId = user.UserID;
    if (!userIdMap.has(userId)) {
      userIdMap.set(userId, []);
    }
    userIdMap.get(userId)!.push(user);
  });

  const duplicateUserIds = Array.from(userIdMap.entries()).filter(([_, users]) => users.length > 1);
  
  if (duplicateUserIds.length === 0) {
    console.log('✓ No duplicate UserIDs found. Nothing to fix.');
    return;
  }

  console.log(`Found ${duplicateUserIds.length} duplicate UserIDs:\n`);

  const fixes: { oldUserId: string; newUserId: string; user: User }[] = [];

  duplicateUserIds.forEach(([userId, users]) => {
    console.log(`UserID: ${userId} (${users.length} entries)`);
    users.forEach((u, i) => {
      console.log(`  ${i + 1}. ${u.FullName} (${u.Email}) - CreatedAt: ${u.CreatedAt}`);
    });

    // Keep the first user (oldest by CreatedAt), generate new IDs for others
    const sortedUsers = users.sort((a, b) => 
      new Date(a.CreatedAt).getTime() - new Date(b.CreatedAt).getTime()
    );

    const keepUser = sortedUsers[0];
    const usersToFix = sortedUsers.slice(1);

    console.log(`  Keeping: ${keepUser.FullName} (${keepUser.Email}) with UserID ${userId}`);
    console.log(`  Will fix ${usersToFix.length} user(s):\n`);

    usersToFix.forEach(user => {
      const newUserId = `USR-${Math.floor(100 + Math.random() * 899)}`;
      fixes.push({ oldUserId: user.UserID, newUserId, user });
      console.log(`    - ${user.FullName} (${user.Email}): ${user.UserID} → ${newUserId}`);
    });
    console.log();
  });

  if (dryRun) {
    console.log('=== DRY RUN COMPLETE ===');
    console.log('Run with --execute to apply these fixes');
    return;
  }

  // Apply fixes
  console.log('=== APPLYING FIXES ===\n');

  const tokenData = await generateGoogleSheetsToken();
  if (!tokenData || !tokenData.spreadsheetId) {
    console.error('Failed to authenticate with Google Sheets');
    return;
  }

  const { accessToken, spreadsheetId } = tokenData;

  // Get Sheets data for row mapping
  console.log('Fetching Sheets data...');
  const rows = await fetchSheetValues(accessToken, spreadsheetId, 'users!A:Z');
  const dataRows = rows.slice(1);
  
  const emailToSheetRow = new Map<string, number>();
  dataRows.forEach((row, i) => {
    const email = (row[2] || '').toLowerCase().trim();
    if (email) {
      emailToSheetRow.set(email, i + 2); // +2 for header + 1-indexing
    }
  });

  for (const fix of fixes) {
    console.log(`Fixing ${fix.user.FullName} (${fix.user.Email})...`);

    try {
      // Update Firestore
      await firestoreAdmin.collection('users').doc(fix.user.Email).update({
        UserID: fix.newUserId,
        UpdatedAt: new Date().toISOString()
      });
      console.log(`  ✓ Updated Firestore: ${fix.oldUserId} → ${fix.newUserId}`);

      // Update Google Sheets
      const sheetRow = emailToSheetRow.get(fix.user.Email.toLowerCase());
      if (sheetRow) {
        await updateSheetValues(
          accessToken,
          spreadsheetId,
          `users!A${sheetRow}:A${sheetRow}`,
          [[fix.newUserId]]
        );
        console.log(`  ✓ Updated Sheets row ${sheetRow}: ${fix.oldUserId} → ${fix.newUserId}`);
      } else {
        console.log(`  ⚠ User not found in Sheets: ${fix.user.Email}`);
      }

    } catch (error) {
      console.error(`  ✗ Failed to fix ${fix.user.Email}:`, error);
    }
  }

  console.log('\n=== FIXES COMPLETE ===');
  console.log(`Fixed ${fixes.length} duplicate UserID(s)`);
  console.log('Please refresh your application to see the changes.');
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
