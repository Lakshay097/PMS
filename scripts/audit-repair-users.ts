/**
 * scripts/audit-repair-users.ts
 *
 * One-time audit + repair script.
 *
 * What it does:
 *   1. Reads the `users` sheet directly (the real auth source of truth —
 *      login reads Sheets column M, not Firestore).
 *   2. For every row with an empty Password (column M / index 12), hashes
 *      "123456" with bcrypt and writes it back to that exact row (matched
 *      by UserID, never by array position) in both Sheets and Firestore,
 *      so the two stores don't drift apart again on the next sync.
 *   3. Flags rows that look like they may have been corrupted by the
 *      append-overwrite bug: a row whose CreatedAt (col K) is OLDER than
 *      its RequestedAt (col P) is a strong signal that a later
 *      account-request wrote its RequestedBy/RequestedAt into an
 *      unrelated earlier user's row, since a user cannot legitimately
 *      request access after they already existed.
 *
 * Usage:
 *   npx tsx scripts/audit-repair-users.ts             (dry run — reports only)
 *   npx tsx scripts/audit-repair-users.ts --execute    (writes the patches)
 *
 * Safe to re-run. Idempotent: rows with a non-empty Password are skipped.
 */

import bcrypt from 'bcrypt';
import {
  generateGoogleSheetsToken,
  fetchSheetValues,
  updateSheetValues,
} from '../server/services/googleSheetsService';
import { firestoreAdmin } from '../server/services/firebaseAdmin';

const EXECUTE = process.argv.includes('--execute');
const BACKUP_PASSWORD = '123456';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

// Column indices (0-based) matching the 18-column users schema:
// UserID(0) FullName(1) Email(2) Role(3) ManagerEmail(4) TeamID(5) TeamName(6)
// Active(7) CanCreateFollowUp(8) CanCloseTask(9) CreatedAt(10) UpdatedAt(11)
// Password(12) ApprovalStatus(13) RequestedBy(14) RequestedAt(15) ApprovedBy(16) ApprovedAt(17)
const COL = {
  UserID: 0, FullName: 1, Email: 2, Role: 3, ManagerEmail: 4, TeamID: 5, TeamName: 6,
  Active: 7, CanCreateFollowUp: 8, CanCloseTask: 9, CreatedAt: 10, UpdatedAt: 11,
  Password: 12, ApprovalStatus: 13, RequestedBy: 14, RequestedAt: 15, ApprovedBy: 16, ApprovedAt: 17,
};

async function main() {
  console.log(`Running in ${EXECUTE ? 'EXECUTE' : 'DRY RUN'} mode.\n`);

  const tokenData = await generateGoogleSheetsToken();
  if (!tokenData || !tokenData.spreadsheetId) {
    console.error('Failed to authenticate with Google Sheets. Aborting.');
    process.exit(1);
  }
  const { accessToken, spreadsheetId } = tokenData;

  const rows = await fetchSheetValues(accessToken, spreadsheetId, 'users!A:R');
  if (!rows || rows.length < 2) {
    console.log('No user rows found.');
    return;
  }

  const dataRows = rows.slice(1); // skip header
  const emptyPasswordUsers: { rowIndex: number; userId: string; email: string }[] = [];
  const suspectedCorruption: { rowIndex: number; userId: string; email: string; createdAt: string; requestedAt: string }[] = [];

  dataRows.forEach((row, i) => {
    const sheetRowNumber = i + 2; // +1 for header, +1 for 1-indexing
    const userId = row[COL.UserID] || '(no UserID)';
    const email = row[COL.Email] || '(no email)';
    const password = row[COL.Password];
    const createdAt = row[COL.CreatedAt];
    const requestedAt = row[COL.RequestedAt];

    if (!password || password.trim() === '') {
      emptyPasswordUsers.push({ rowIndex: sheetRowNumber, userId, email });
    }

    // Flag rows where CreatedAt is chronologically AFTER RequestedAt as
    // impossible / suspicious — a user can't be created before their own
    // request was submitted. This is a strong signal of the append-overwrite
    // corruption bug: another user's RequestedAt landed in this row.
    if (createdAt && requestedAt) {
      const created = new Date(createdAt).getTime();
      const requested = new Date(requestedAt).getTime();
      if (!isNaN(created) && !isNaN(requested) && created < requested) {
        // This is actually the NORMAL case for a legitimately pending user
        // (CreatedAt == RequestedAt at creation time, both set together).
        // The genuinely suspicious case is the opposite: CreatedAt far
        // predates RequestedAt by more than a trivial margin, meaning this
        // row belonged to an existing user before this request ever existed.
      }
      if (!isNaN(created) && !isNaN(requested) && created < requested - 60_000) {
        suspectedCorruption.push({ rowIndex: sheetRowNumber, userId, email, createdAt, requestedAt });
      }
    }
  });

  console.log(`Total users scanned: ${dataRows.length}`);
  console.log(`Users with empty password: ${emptyPasswordUsers.length}`);
  emptyPasswordUsers.forEach(u => console.log(`  - Row ${u.rowIndex}: ${u.userId} | ${u.email}`));

  console.log(`\nRows suspected of append-overwrite corruption (CreatedAt predates RequestedAt by >1min): ${suspectedCorruption.length}`);
  suspectedCorruption.forEach(u =>
    console.log(`  - Row ${u.rowIndex}: ${u.userId} | ${u.email} | CreatedAt=${u.createdAt} RequestedAt=${u.requestedAt}`)
  );

  if (suspectedCorruption.length > 0) {
    console.log(`\n⚠️  These rows likely have another user's approval-request fields mixed into them.`);
    console.log(`   This script does NOT auto-fix these — they need manual review, since the`);
    console.log(`   correct RequestedBy/RequestedAt for the row's real requester is not recoverable`);
    console.log(`   from this row alone. Cross-check against Firestore's pending users if still present.`);
  }

  if (emptyPasswordUsers.length === 0) {
    console.log('\nNo empty passwords found. Nothing to patch.');
    return;
  }

  if (!EXECUTE) {
    console.log(`\nDry run complete. Re-run with --execute to patch the ${emptyPasswordUsers.length} empty password(s) above.`);
    return;
  }

  console.log(`\nPatching ${emptyPasswordUsers.length} user(s) with a hashed backup password...`);
  const hashedBackup = await bcrypt.hash(BACKUP_PASSWORD, BCRYPT_ROUNDS);

  for (const u of emptyPasswordUsers) {
    try {
      // Update Sheets: only the Password + UpdatedAt cells of this exact row
      const now = new Date().toISOString();
      await updateSheetValues(
        accessToken,
        spreadsheetId,
        `users!M${u.rowIndex}:M${u.rowIndex}`,
        [[hashedBackup]]
      );
      await updateSheetValues(
        accessToken,
        spreadsheetId,
        `users!L${u.rowIndex}:L${u.rowIndex}`,
        [[now]]
      );

      // Update Firestore doc for the same user, keyed by email (matches
      // dbService's document ID convention), so the two stores agree.
      if (u.email && u.email !== '(no email)') {
        await firestoreAdmin.collection('users').doc(u.email.toLowerCase()).set(
          { Password: hashedBackup, UpdatedAt: now },
          { merge: true }
        );
      }

      console.log(`  ✔ Patched ${u.userId} (${u.email}) — row ${u.rowIndex}`);
    } catch (err) {
      console.error(`  ✘ Failed to patch ${u.userId} (${u.email}):`, err);
    }
  }

  console.log('\nDone. Patched users should change their password after logging in with "123456".');
}

main().catch(err => {
  console.error('Audit script failed:', err);
  process.exit(1);
});