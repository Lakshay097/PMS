/**
 * scripts/check-user-duplicates.ts
 *
 * Diagnostic script to check for duplicate user entries in Google Sheets.
 * Usage: npx tsx scripts/check-user-duplicates.ts <email>
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { generateGoogleSheetsToken, fetchSheetValues } from '../server/services/googleSheetsService';

async function main() {
  const email = process.argv[2];
  
  if (!email) {
    console.error('Usage: npx tsx scripts/check-user-duplicates.ts <email>');
    console.error('Example: npx tsx scripts/check-user-duplicates.ts bhola.upadhyay@pw.live');
    process.exit(1);
  }

  console.log(`Checking for duplicates of email: ${email}\n`);

  const tokenData = await generateGoogleSheetsToken();
  if (!tokenData || !tokenData.spreadsheetId) {
    console.error('Failed to authenticate with Google Sheets');
    process.exit(1);
  }

  const { accessToken, spreadsheetId } = tokenData;

  console.log('Fetching users sheet...');
  const rows = await fetchSheetValues(accessToken, spreadsheetId, 'users!A:Z');
  
  if (!rows || rows.length < 2) {
    console.log('No user rows found');
    return;
  }

  const header = rows[0];
  const dataRows = rows.slice(1);
  
  console.log(`Total rows in sheet: ${dataRows.length}\n`);

  // Find all rows matching the email
  const matches: { rowIndex: number; row: string[] }[] = [];
  const searchEmail = email.toLowerCase().trim();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowEmail = (row[2] || '').toLowerCase().trim(); // Email is column C (index 2)
    
    if (rowEmail === searchEmail) {
      matches.push({ rowIndex: i + 2, row }); // +2 for header + 1-indexing
    }
  }

  if (matches.length === 0) {
    console.log(`No rows found with email: ${email}`);
  } else if (matches.length === 1) {
    console.log(`Found exactly 1 row with email: ${email}`);
    console.log('No duplicates detected.');
  } else {
    console.log(`⚠️  Found ${matches.length} rows with email: ${email}`);
    console.log('\n=== DUPLICATE ENTRIES ===\n');
    
    matches.forEach((match, idx) => {
      console.log(`Entry #${idx + 1} (Row ${match.rowIndex}):`);
      console.log(`  UserID: ${match.row[0] || '(empty)'}`);
      console.log(`  FullName: ${match.row[1] || '(empty)'}`);
      console.log(`  Email: ${match.row[2] || '(empty)'}`);
      console.log(`  Role: ${match.row[3] || '(empty)'}`);
      console.log(`  ManagerEmail: ${match.row[4] || '(empty)'}`);
      console.log(`  TeamID: ${match.row[5] || '(empty)'}`);
      console.log(`  TeamName: ${match.row[6] || '(empty)'}`);
      console.log(`  Active: ${match.row[7] || '(empty)'}`);
      console.log(`  CreatedAt: ${match.row[10] || '(empty)'}`);
      console.log(`  UpdatedAt: ${match.row[11] || '(empty)'}`);
      console.log();
    });

    console.log('=== RECOMMENDATION ===');
    console.log('You should manually review these duplicate entries in Google Sheets.');
    console.log('Keep only the most recent/complete entry and delete the others.');
    console.log('After cleaning up in Sheets, you may need to clean up Firestore as well.');
  }
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
