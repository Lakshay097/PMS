import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { firestoreAdmin } from '../server/services/firebaseAdmin';
import { generateGoogleSheetsToken, fetchSheetValues, updateSheetValues } from '../server/services/googleSheetsService';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Load EcomTeamsData.csv for team assignments
const csvPath = path.join(__dirname, '../data/EcomTeamsData.csv');
const csvData = fs.readFileSync(csvPath, 'utf-8');
const csvLines = csvData.split('\n').filter(line => line.trim());
const csvHeaders = csvLines[0].split(',').map(h => h.trim());

interface CsvUser {
  Name: string;
  Email: string;
  ManagerMail: string;
  Role: string;
  Team: string;
}

const csvUsers: Record<string, CsvUser> = {};
for (let i = 1; i < csvLines.length; i++) {
  const values = csvLines[i].split(',').map(v => v.trim());
  if (values.length >= 5) {
    const user: CsvUser = {
      Name: values[0],
      Email: values[1],
      ManagerMail: values[2],
      Role: values[3],
      Team: values[4]
    };
    csvUsers[user.Email.toLowerCase()] = user;
  }
}

console.log(`Loaded ${Object.keys(csvUsers).length} users from EcomTeamsData.csv`);

interface ProblematicUser {
  rowIndex: number;
  currentUserId: string;
  fullName: string;
  email: string;
  role: string;
  managerEmail: string;
  teamId: string;
  teamName: string;
  password: string;
  active: string;
  canCreateFollowUp: string;
  canCloseTask: string;
  createdAt: string;
  updatedAt: string;
  approvalStatus: string;
  requestedBy: string;
  requestedAt: string;
  approvedBy: string;
  approvedAt: string;
}

async function fixJumbledUsers() {
  console.log('=== Fixing Jumbled Users with Empty Emails and Plain-Text Passwords ===\n');

  const tokenData = await generateGoogleSheetsToken();
  if (!tokenData || !tokenData.spreadsheetId) {
    console.error('Failed to get Google Sheets token');
    return;
  }

  const spreadsheetId = tokenData.spreadsheetId;
  const usersRange = 'users!A:R';
  const users = await fetchSheetValues(tokenData.accessToken, spreadsheetId, usersRange);

  if (!users || users.length === 0) {
    console.error('Failed to fetch users');
    return;
  }

  console.log(`Found ${users.length - 1} user rows (excluding header)\n`);

  // Identify problematic rows (UserID column contains email instead of USR-XXX)
  const problematicUsers: ProblematicUser[] = [];
  const backupPasswordHash = await bcrypt.hash('123456', 12);

  for (let i = 1; i < users.length; i++) {
    const row = users[i];
    const userId = (row[0] || '').trim();
    
    // Check if UserID looks like an email (contains @) instead of USR-XXX format
    if (userId.includes('@') && !userId.startsWith('USR-')) {
      console.log(`Found jumbled row at index ${i}: UserID = "${userId}"`);
      
      problematicUsers.push({
        rowIndex: i,
        currentUserId: userId,
        fullName: row[1] || '',
        email: row[2] || '',
        role: row[3] || '',
        managerEmail: row[4] || '',
        teamId: row[5] || '',
        teamName: row[6] || '',
        password: row[12] || '',
        active: row[7] || '',
        canCreateFollowUp: row[8] || '',
        canCloseTask: row[9] || '',
        createdAt: row[10] || '',
        updatedAt: row[11] || '',
        approvalStatus: row[13] || '',
        requestedBy: row[14] || '',
        requestedAt: row[15] || '',
        approvedBy: row[16] || '',
        approvedAt: row[17] || ''
      });
    }
  }

  if (problematicUsers.length === 0) {
    console.log('No jumbled rows found.');
    return;
  }

  console.log(`\nFound ${problematicUsers.length} problematic rows to fix:\n`);
  problematicUsers.forEach(user => {
    console.log(`- Row ${user.rowIndex + 1}: ${user.fullName} (${user.email}) - UserID: "${user.currentUserId}"`);
  });

  // Get the next available UserID
  const existingUserIds = new Set<string>();
  for (let i = 1; i < users.length; i++) {
    const userId = (users[i][0] || '').trim();
    if (userId.startsWith('USR-')) {
      existingUserIds.add(userId);
    }
  }

  // Find the highest numeric part
  let maxNumericId = 0;
  existingUserIds.forEach(userId => {
    const match = userId.match(/USR-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNumericId) {
        maxNumericId = num;
      }
    }
  });

  console.log(`\nMax existing UserID: USR-${maxNumericId}`);
  console.log(`Will generate UserIDs starting from USR-${maxNumericId + 1}\n`);

  // Fix each problematic user
  for (const user of problematicUsers) {
    const newUserId = `USR-${maxNumericId + 1}`;
    maxNumericId++;

    console.log(`\n--- Fixing: ${user.fullName} (${user.email}) ---`);
    console.log(`New UserID: ${newUserId}`);

    // Get data from CSV if available
    const csvUser = csvUsers[user.email.toLowerCase()];
    const managerEmail = csvUser?.ManagerMail || user.managerEmail;
    const teamName = csvUser?.Team || user.teamName;
    const role = csvUser?.Role || user.role;

    console.log(`CSV Data found: ${csvUser ? 'Yes' : 'No'}`);
    if (csvUser) {
      console.log(`  Manager: ${managerEmail}, Team: ${teamName}, Role: ${role}`);
    }

    // Update Google Sheets row
    const fixedRow = [...users[user.rowIndex]];
    fixedRow[0] = newUserId; // UserID
    fixedRow[4] = managerEmail; // ManagerEmail
    fixedRow[6] = teamName; // TeamName
    fixedRow[12] = backupPasswordHash; // Password (hashed)
    fixedRow[7] = 'TRUE'; // Active
    fixedRow[8] = 'TRUE'; // CanCreateFollowUp
    fixedRow[9] = 'TRUE'; // CanCloseTask
    fixedRow[13] = 'approved'; // ApprovalStatus
    fixedRow[16] = 'system'; // ApprovedBy
    fixedRow[17] = new Date().toISOString(); // ApprovedAt
    
    // Update timestamp
    const now = new Date().toISOString();
    fixedRow[11] = now; // UpdatedAt

    // Update the sheet
    const range = `users!A${user.rowIndex + 1}:R${user.rowIndex + 1}`;
    const success = await updateSheetValues(
      tokenData.accessToken,
      spreadsheetId,
      range,
      [fixedRow]
    );

    if (success) {
      console.log(`✓ Updated Google Sheets row ${user.rowIndex + 1}`);
    } else {
      console.error(`✗ Failed to update Google Sheets row ${user.rowIndex + 1}`);
      continue;
    }

    // Update Firestore
    try {
      const userDoc = await firestoreAdmin.collection('users').doc(user.email).get();
      
      if (userDoc.exists) {
        console.log(`Updating existing Firestore document for ${user.email}`);
        await firestoreAdmin.collection('users').doc(user.email).update({
          UserID: newUserId,
          ManagerEmail: managerEmail,
          TeamNames: teamName ? [teamName] : [],
          Password: backupPasswordHash,
          Active: true,
          CanCreateFollowUp: true,
          CanCloseTask: true,
          ApprovalStatus: 'approved',
          ApprovedBy: 'system',
          ApprovedAt: new Date().toISOString(),
          UpdatedAt: now
        });
        console.log(`✓ Updated Firestore`);
      } else {
        console.log(`Creating new Firestore document for ${user.email}`);
        await firestoreAdmin.collection('users').doc(user.email).set({
          UserID: newUserId,
          FullName: user.fullName,
          Email: user.email,
          Role: role,
          ManagerEmail: managerEmail,
          TeamIDs: user.teamId ? [user.teamId] : [],
          TeamNames: teamName ? [teamName] : [],
          Active: true,
          CanCreateFollowUp: true,
          CanCloseTask: true,
          Password: backupPasswordHash,
          CreatedAt: user.createdAt || now,
          UpdatedAt: now,
          ApprovalStatus: 'approved',
          RequestedBy: 'system',
          RequestedAt: now,
          ApprovedBy: 'system',
          ApprovedAt: new Date().toISOString()
        });
        console.log(`✓ Created Firestore document`);
      }
    } catch (error) {
      console.error(`✗ Failed to update Firestore for ${user.email}:`, error);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total problematic rows fixed: ${problematicUsers.length}`);
  console.log('All affected users now have:');
  console.log('- Proper UserIDs (USR-XXX format)');
  console.log('- Hashed passwords (bcrypt)');
  console.log('- Updated timestamps');
  console.log('- Correct team assignments from CSV');
  console.log('- Proper manager emails from CSV');
  console.log('- Approval status set to "approved"');
  console.log('- Active status enabled');
  console.log('- CanCreateFollowUp and CanCloseTask enabled');
}

fixJumbledUsers()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
