/**
 * ONE-TIME MIGRATION: Hash any plaintext passwords still in Sheets column M
 * and mirror the hash to Firestore.
 *
 * SAFETY PROPERTIES:
 *  - Read-only audit mode by default; writes only happen when --execute is passed
 *  - Never logs or prints password values — only counts and email addresses
 *  - Login is unaffected: authService.ts already accepts both $2b$ hashes
 *    and plaintext fallback, so hashing in-place doesn't break existing sessions
 *  - Idempotent: rows already containing a $2b$ / $2a$ hash are skipped entirely
 *  - Empty password rows are counted but never touched
 *
 * USAGE:
 *   Audit (no writes):
 *     npx ts-node scripts/migrate-plaintext-passwords.ts
 *
 *   Execute (writes hashes to Sheets + Firestore):
 *     npx ts-node scripts/migrate-plaintext-passwords.ts --execute
 *
 * DEPENDENCIES: only firebase-admin (in package.json), bcrypt (in package.json),
 * crypto (Node built-in), and native fetch (Node 18+). No googleapis needed.
 */

import 'dotenv/config';
import * as crypto from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import bcrypt from 'bcrypt';

const EXECUTE = process.argv.includes('--execute');
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!;
const USERS_RANGE = 'users!A:R';

// Column indices — must match authController.ts exactly
const EMAIL_COL      = 2;  // C
const PASSWORD_COL   = 12; // M
const UPDATED_AT_COL = 11; // L

// ── Firebase Admin init ──────────────────────────────────────────────────────

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = getFirestore();

// ── Sheets auth — mirrors generateGoogleSheetsToken() in googleSheetsService.ts

async function getSheetsAccessToken(): Promise<string> {
  const email      = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY!.trim().replace(/\\n/g, '\n');

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const claims = {
    iss:   email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:   'https://oauth2.googleapis.com/token',
    exp,
    iat,
  };

  const header          = { alg: 'RS256', typ: 'JWT' };
  const base64UrlHeader  = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64UrlPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${base64UrlHeader}.${base64UrlPayload}`);
  const signature = sign.sign(privateKey, 'base64url');
  const jwt = `${base64UrlHeader}.${base64UrlPayload}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Sheets token: ${await res.text()}`);
  }
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

// ── Sheets helpers ───────────────────────────────────────────────────────────

async function fetchRows(token: string): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${USERS_RANGE}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets read failed: ${await res.text()}`);
  const data = await res.json() as { values?: string[][] };
  return data.values ?? [];
}

async function updateRow(token: string, sheetRowNumber: number, row: string[]): Promise<void> {
  const range = `users!A${sheetRowNumber}:R${sheetRowNumber}`;
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res   = await fetch(url, {
    method:  'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ values: [row] }),
  });
  if (!res.ok) throw new Error(`Sheets update failed for row ${sheetRowNumber}: ${await res.text()}`);
}

// ── Hash detection — identical to authService.ts / authController.ts ─────────

function isBcryptHash(value: string): boolean {
  return value.startsWith('$2b$') || value.startsWith('$2a$');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMode: ${EXECUTE ? 'EXECUTE (will write)' : 'AUDIT (read-only, no writes)'}`);
  console.log(`BCRYPT_ROUNDS: ${BCRYPT_ROUNDS}\n`);

  const token = await getSheetsAccessToken();
  const rows  = await fetchRows(token);

  if (rows.length === 0) {
    console.log('No rows found in users sheet.');
    return;
  }

  // rows[0] is the header row; data starts at rows[1] (sheet row 2)
  const dataRows = rows.slice(1);
  console.log(`Total user rows (excluding header): ${dataRows.length}`);

  type RowReport = {
    sheetRowNumber: number; // 1-indexed (header=1, first data row=2)
    email: string;
    status: 'already_hashed' | 'plaintext' | 'empty';
  };

  const report: RowReport[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row      = dataRows[i];
    const email    = (row[EMAIL_COL] ?? '(unknown)') as string;
    const password = row[PASSWORD_COL] as string | undefined;
    const sheetRowNumber = i + 2; // +1 for header row, +1 for 1-indexing

    if (!password) {
      // undefined (trailing cell trimmed by Sheets) or empty string
      report.push({ sheetRowNumber, email, status: 'empty' });
    } else if (isBcryptHash(password)) {
      report.push({ sheetRowNumber, email, status: 'already_hashed' });
    } else {
      report.push({ sheetRowNumber, email, status: 'plaintext' });
    }
  }

  const alreadyHashed = report.filter(r => r.status === 'already_hashed');
  const plaintext     = report.filter(r => r.status === 'plaintext');
  const empty         = report.filter(r => r.status === 'empty');

  console.log(`  Already hashed ($2b$/$2a$): ${alreadyHashed.length}`);
  console.log(`  Plaintext (need migration): ${plaintext.length}`);
  console.log(`  Empty / no password set:    ${empty.length}`);

  if (plaintext.length === 0) {
    console.log('\nNo plaintext passwords found. Nothing to migrate.');
    return;
  }

  console.log('\nRows with plaintext passwords (emails only, no values):');
  plaintext.forEach(r => console.log(`  Row ${r.sheetRowNumber}: ${r.email}`));

  // Hard stop here in audit mode — nothing below this line runs without --execute
  if (!EXECUTE) {
    console.log('\nRun with --execute to hash these rows in-place.');
    return;
  }

  // ── EXECUTE: hash in-place ──────────────────────────────────────────────────

  console.log('\nStarting migration...');
  let succeeded = 0;
  let failed    = 0;

  for (const r of plaintext) {
    const rowIdx          = r.sheetRowNumber - 2; // back to dataRows index
    const row             = dataRows[rowIdx];
    const plaintextValue  = row[PASSWORD_COL] as string;
    const email           = row[EMAIL_COL] as string;
    const now             = new Date().toISOString();

    try {
      // Hash the plaintext value — never logged
      const hashed = await bcrypt.hash(plaintextValue, BCRYPT_ROUNDS);

      // 1. Write hash to Sheets (full row so column alignment is preserved)
      const updatedRow = [...row];
      updatedRow[PASSWORD_COL]   = hashed;
      updatedRow[UPDATED_AT_COL] = now;
      await updateRow(token, r.sheetRowNumber, updatedRow);

      // 2. Mirror to Firestore (merge — all other fields untouched)
      await db.collection('users').doc(email).set(
        { Password: hashed, UpdatedAt: now },
        { merge: true }
      );

      // Only email and row number logged — never the plaintext or hash value
      console.log(`  ✓ Row ${r.sheetRowNumber} (${email}): hashed`);
      succeeded++;
    } catch (err) {
      console.error(`  ✗ Row ${r.sheetRowNumber} (${email}): FAILED —`, err);
      failed++;
    }
  }

  console.log(`\nMigration complete. Succeeded: ${succeeded}, Failed: ${failed}`);
  if (failed > 0) {
    console.log('Re-run --execute to retry failed rows (already-hashed rows are skipped).');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
