import { generateGoogleSheetsToken, fetchSheetValues, updateSheetValues } from '../server/services/googleSheetsService';
import bcrypt from 'bcrypt';

/**
 * Audit script to scan for empty passwords and patch them
 */
async function auditAndPatchPasswords() {
  console.log('Starting password audit...');
  
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

  console.log(`Found ${users.length - 1} user rows (excluding header)`);

  const usersWithEmptyPasswords: { userId: string; email: string; fullName: string; rowIndex: number }[] = [];
  const backupPasswordHash = await bcrypt.hash('123456', 12);

  // Scan for empty passwords (column M is index 12)
  for (let i = 1; i < users.length; i++) {
    const row = users[i];
    const password = row[12]; // Password column (M)
    
    if (!password || password === '' || password === null || password === undefined) {
      const userId = row[0];
      const email = row[2];
      const fullName = row[1];
      
      console.log(`Found empty password for user: ${userId} | ${fullName} | ${email} at row ${i + 1}`);
      usersWithEmptyPasswords.push({ userId, email, fullName, rowIndex: i });
      
      // Patch with backup password
      row[12] = backupPasswordHash;
      row[11] = new Date().toISOString(); // Update UpdatedAt
    }
  }

  if (usersWithEmptyPasswords.length === 0) {
    console.log('No users with empty passwords found.');
    return;
  }

  console.log(`\nPatching ${usersWithEmptyPasswords.length} users with backup password...`);

  // Update each affected row
  for (const user of usersWithEmptyPasswords) {
    const row = users[user.rowIndex];
    const range = `users!A${user.rowIndex + 1}:R${user.rowIndex + 1}`;
    
    const success = await updateSheetValues(
      tokenData.accessToken,
      spreadsheetId,
      range,
      [row]
    );

    if (success) {
      console.log(`✓ Patched: ${user.userId} | ${user.fullName} | ${user.email}`);
    } else {
      console.error(`✗ Failed to patch: ${user.userId} | ${user.fullName} | ${user.email}`);
    }
  }

  console.log('\nPassword audit complete.');
  console.log('Summary:');
  console.log(`- Total users scanned: ${users.length - 1}`);
  console.log(`- Users with empty passwords: ${usersWithEmptyPasswords.length}`);
  console.log(`- Users patched: ${usersWithEmptyPasswords.length}`);
  console.log('\nAffected users:');
  usersWithEmptyPasswords.forEach(user => {
    console.log(`  - ${user.userId} | ${user.fullName} | ${user.email}`);
  });
}

// Run the audit
auditAndPatchPasswords().catch(console.error);
