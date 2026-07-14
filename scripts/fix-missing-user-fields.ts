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

// Manual overrides for users not in CSV
const manualOverrides: Record<string, { managerEmail: string; teamName: string; role: string }> = {
  'atif.khan@finz.club': {
    managerEmail: 'rajeev.1@pw.live',
    teamName: 'Ecom - SST',
    role: 'Stakeholder'
  }
};

async function fixMissingUserFields() {
  console.log('=== Fixing Missing User Fields ===\n');

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

  const backupPasswordHash = await bcrypt.hash('123456', 12);
  const now = new Date().toISOString();

  // Process all users from CSV
  const emailsToProcess = Object.keys(csvUsers);
  console.log(`Processing ${emailsToProcess.length} users from CSV\n`);

  // Find rows for users that need fixing
  for (const emailToFix of emailsToProcess) {
    let rowIndex = -1;
    let row: string[] = [];
    
    for (let i = 1; i < users.length; i++) {
      const email = (users[i][2] || '').trim().toLowerCase();
      if (email === emailToFix) {
        rowIndex = i;
        row = users[i];
        break;
      }
    }

    if (rowIndex === -1) {
      console.log(`User ${emailToFix} not found in sheet`);
      continue;
    }

    const userId = (row[0] || '').trim();
    const fullName = (row[1] || '').trim();
    const email = (row[2] || '').trim();
    const currentRole = (row[3] || '').trim();
    const currentManagerEmail = (row[4] || '').trim();
    const teamId = (row[5] || '').trim();
    const currentTeamName = (row[6] || '').trim();
    const active = (row[7] || '').trim();
    const canCreateFollowUp = (row[8] || '').trim();
    const canCloseTask = (row[9] || '').trim();
    const createdAt = (row[10] || '').trim();
    const updatedAt = (row[11] || '').trim();
    const password = (row[12] || '').trim();
    const approvalStatus = (row[13] || '').trim();
    const requestedBy = (row[14] || '').trim();
    const requestedAt = (row[15] || '').trim();
    const approvedBy = (row[16] || '').trim();
    const approvedAt = (row[17] || '').trim();

    console.log(`\n--- Processing: ${fullName} (${email}) ---`);
    console.log(`UserID: ${userId}`);
    console.log(`Current TeamID: "${teamId}", TeamName: "${currentTeamName}"`);
    console.log(`Current ApprovalStatus: "${approvalStatus}", ApprovedBy: "${approvedBy}"`);

    // Get data from CSV or manual override
    const csvUser = csvUsers[email.toLowerCase()];
    const manualOverride = manualOverrides[email.toLowerCase()];
    
    let managerEmail, teamName, role;
    
    if (csvUser) {
      managerEmail = csvUser.ManagerMail;
      teamName = csvUser.Team;
      role = csvUser.Role;
      console.log(`CSV Data: Manager=${managerEmail}, Team=${teamName}, Role=${role}`);
    } else if (manualOverride) {
      managerEmail = manualOverride.managerEmail;
      teamName = manualOverride.teamName;
      role = manualOverride.role;
      console.log(`Manual Override: Manager=${managerEmail}, Team=${teamName}, Role=${role}`);
    } else {
      console.log(`⚠ User not found in CSV or manual overrides, skipping`);
      continue;
    }

    // Update Google Sheets row
    const fixedRow = [...row];
    fixedRow[4] = managerEmail; // ManagerEmail
    fixedRow[6] = teamName; // TeamName
    fixedRow[12] = backupPasswordHash; // Password (hashed)
    fixedRow[7] = 'TRUE'; // Active
    fixedRow[8] = 'TRUE'; // CanCreateFollowUp
    fixedRow[9] = 'TRUE'; // CanCloseTask
    fixedRow[13] = 'approved'; // ApprovalStatus
    fixedRow[16] = 'system'; // ApprovedBy
    fixedRow[17] = new Date().toISOString(); // ApprovedAt
    fixedRow[11] = now; // UpdatedAt

    // Update the sheet
    const range = `users!A${rowIndex + 1}:R${rowIndex + 1}`;
    const success = await updateSheetValues(
      tokenData.accessToken,
      spreadsheetId,
      range,
      [fixedRow]
    );

    if (success) {
      console.log(`✓ Updated Google Sheets row ${rowIndex + 1}`);
    } else {
      console.error(`✗ Failed to update Google Sheets row ${rowIndex + 1}`);
      continue;
    }

    // Update Firestore
    try {
      const userDoc = await firestoreAdmin.collection('users').doc(email).get();
      
      if (userDoc.exists) {
        console.log(`Updating existing Firestore document for ${email}`);
        await firestoreAdmin.collection('users').doc(email).update({
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
        console.log(`Creating new Firestore document for ${email}`);
        await firestoreAdmin.collection('users').doc(email).set({
          UserID: userId,
          FullName: fullName,
          Email: email,
          Role: role,
          ManagerEmail: managerEmail,
          TeamIDs: teamId ? [teamId] : [],
          TeamNames: teamName ? [teamName] : [],
          Active: true,
          CanCreateFollowUp: true,
          CanCloseTask: true,
          Password: backupPasswordHash,
          CreatedAt: createdAt || now,
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
      console.error(`✗ Failed to update Firestore for ${email}:`, error);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Processed ${emailsToProcess.length} users from CSV`);
  console.log('All affected users now have:');
  console.log('- Correct team assignments from CSV');
  console.log('- Proper manager emails from CSV');
  console.log('- Approval status set to "approved"');
  console.log('- Active status enabled');
  console.log('- CanCreateFollowUp and CanCloseTask enabled');
  console.log('- Hashed passwords');
}

fixMissingUserFields()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
