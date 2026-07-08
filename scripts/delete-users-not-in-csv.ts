/**
 * scripts/delete-users-not-in-csv.ts
 *
 * ONE-TIME, HIGHLY DESTRUCTIVE SCRIPT.
 * Deletes every user NOT present in the given CSV, from BOTH Firestore and Google Sheets.
 *
 * CSV format required (only email column matters):
 *   email,team
 *   john@x.com,Expansion
 *
 * Usage (ALWAYS dry-run first):
 *   npx ts-node -r dotenv/config scripts/delete-users-not-in-csv.ts ./data/team-assignments.csv --dry-run
 *
 * Real deletion (irreversible):
 *   npx ts-node -r dotenv/config scripts/delete-users-not-in-csv.ts ./data/team-assignments.csv --confirm-delete
 *
 * SAFETY:
 *   - Defaults to dry-run; --confirm-delete must be spelled exactly to do anything real.
 *   - Writes a full JSON backup (Firestore doc data + full Sheets row) BEFORE any deletion.
 *   - PROTECTED_EMAILS / PROTECTED_ROLES are never deleted, in Firestore or Sheets.
 *   - Sheets has no "delete row" API — this rewrites the entire users!A:R range with the
 *     surviving rows only (header + kept rows), matching the pattern your own
 *     sheetsSyncController.ts already uses for merge-then-write.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { parse } from "csv-parse/sync";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// CONFIG — CONFIRM BEFORE RUNNING FOR REAL
// ---------------------------------------------------------------------------
const USERS_COLLECTION = "users";
const ROLE_COLUMN_INDEX = 3; // column D = Role, per newUserRow layout
const PROTECTED_EMAILS: string[] = ["aarti.1@pw.live",
"abhishek.das@pw.live",
"abhishek.pengoria@pw.live",
"admin@pw.live",
"akshay.jain@pw.live",
"akshay.verma1@pw.live",
"aman@pw.live",
"anush.gupta@pw.live",
"arpit.shukla@pw.live",
"arun.solanki@pw.live",
"ashwin.mishra@pw.live",
"bharat.chaujar@pw.live",
"deepak.mishra@pw.live",
"jasodha.rawat@pw.live",
"lakshay.kumar@pw.live",
"narayan.tiwari1@pw.live",
"nikhil.ranjan3@pw.live",
"nishant.goel@pw.live",
"rajan.agarwal@pw.live",
"rajeev.1@pw.live",
"ravi.bhardwaj@pw.live",
"sourabh@pw.live",
"sudhir.bhosle@pw.live",
"tejpal.gothwal@pw.live",
"utsav@pw.live",
"varun.dhiman@pw.live",
"vipul.gupta@pw.live",
"vishal.kumar1@pw.live",
"yash.kapoor@pw.live",
"yogesh.2@pw.live",
"yogesh.uniyal@pw.live"
];
const PROTECTED_ROLES: string[] = ["Admin"]; // TODO: confirm exact casing used in your Role column
const BATCH_LIMIT = 500;

// ---------------------------------------------------------------------------
// Firebase init
// ---------------------------------------------------------------------------
function getDb() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  const missing: string[] = [];
  if (!projectId) missing.push("FIREBASE_PROJECT_ID");
  if (!clientEmail) missing.push("FIREBASE_ADMIN_CLIENT_EMAIL");
  if (!privateKey) missing.push("FIREBASE_ADMIN_PRIVATE_KEY");
  if (missing.length > 0) {
    console.error(`Missing Firebase env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
  const formattedPrivateKey = privateKey!.replace(/\\n/g, "\n");
  if (!getApps().length) {
    initializeApp({
      credential: cert({ projectId: projectId!, clientEmail: clientEmail!, privateKey: formattedPrivateKey }),
    });
  }
  return getFirestore();
}

// ---------------------------------------------------------------------------
// Google Sheets auth + helpers
// ---------------------------------------------------------------------------
interface SheetsToken {
  accessToken: string;
  spreadsheetId: string;
}

async function generateGoogleSheetsToken(): Promise<SheetsToken> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.trim();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID?.trim();
  const missing: string[] = [];
  if (!email) missing.push("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  if (!privateKey) missing.push("GOOGLE_PRIVATE_KEY");
  if (!spreadsheetId) missing.push("GOOGLE_SPREADSHEET_ID");
  if (missing.length > 0) {
    console.error(`Missing Google Sheets env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const claims = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp,
    iat,
  };
  const header = { alg: "RS256", typ: "JWT" };
  const b64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const b64Payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${b64Header}.${b64Payload}`);
  const formattedKey = privateKey!.replace(/\\n/g, "\n");
  const signature = sign.sign(formattedKey, "base64url");
  const jwt = `${b64Header}.${b64Payload}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!tokenRes.ok) {
    console.error(`Google SA token fetch failed: HTTP ${tokenRes.status} - ${await tokenRes.text()}`);
    process.exit(1);
  }
  const tokenData = await tokenRes.json();
  return { accessToken: tokenData.access_token, spreadsheetId: spreadsheetId! };
}

async function fetchSheetValues(accessToken: string, spreadsheetId: string, range: string): Promise<string[][]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    console.error(`fetchSheetValues failed for range ${range}: HTTP ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.values || [];
}

async function clearSheetRange(accessToken: string, spreadsheetId: string, range: string): Promise<boolean> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return res.ok;
}

async function updateSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<boolean> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    }
  );
  if (!res.ok) {
    console.error(`updateSheetValues failed for range ${range}: HTTP ${res.status} - ${await res.text()}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function loadCsvEmails(filePath: string): Set<string> {
  const raw = fs.readFileSync(filePath, "utf-8");
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  const emails = new Set<string>();
  for (const r of records) {
    const email = (r.email || "").toLowerCase().trim();
    if (email) emails.add(email);
  }
  return emails;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith("--"));
  const confirmDelete = args.includes("--confirm-delete");
  const dryRun = !confirmDelete;

  if (!csvPath) {
    console.error("Usage: npx ts-node scripts/delete-users-not-in-csv.ts <csv> [--dry-run | --confirm-delete]");
    process.exit(1);
  }
  const absPath = path.resolve(csvPath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const db = getDb();
  const { accessToken, spreadsheetId } = await generateGoogleSheetsToken();

  console.log(`\nLoading reference CSV: ${absPath}`);
  const keepEmails = loadCsvEmails(absPath);
  console.log(`CSV contains ${keepEmails.size} emails to KEEP.\n`);

  // --- Firestore side ---
  console.log("Fetching all users from Firestore...");
  const fsSnapshot = await db.collection(USERS_COLLECTION).get();
  console.log(`Firestore users: ${fsSnapshot.size}`);

  const fsToDelete: { id: string; data: FirebaseFirestore.DocumentData }[] = [];
  const fsProtected: string[] = [];
  fsSnapshot.forEach((doc) => {
    const data = doc.data();
    const email = doc.id.toLowerCase();
    const role = (data["Role"] || "").toString().toLowerCase();
    if (keepEmails.has(email)) return;
    if (PROTECTED_EMAILS.map((e) => e.toLowerCase()).includes(email)) {
      fsProtected.push(email);
      return;
    }
    if (PROTECTED_ROLES.map((r) => r.toLowerCase()).includes(role)) {
      fsProtected.push(email);
      return;
    }
    fsToDelete.push({ id: doc.id, data });
  });

  // --- Sheets side ---
  console.log("Fetching users sheet...");
  const userRows = await fetchSheetValues(accessToken, spreadsheetId, "users!A:R");
  const header = userRows[0] || [];
  const dataRows = userRows.slice(1);

  const sheetsKept: string[][] = [];
  const sheetsToDelete: string[] = [];
  const sheetsProtected: string[] = [];

  for (const row of dataRows) {
    const email = (row[2] || "").toLowerCase().trim();
    const role = (row[ROLE_COLUMN_INDEX] || "").toLowerCase().trim();
    if (!email || keepEmails.has(email)) {
      sheetsKept.push(row);
      continue;
    }
    if (PROTECTED_EMAILS.map((e) => e.toLowerCase()).includes(email)) {
      sheetsKept.push(row);
      sheetsProtected.push(email);
      continue;
    }
    if (PROTECTED_ROLES.map((r) => r.toLowerCase()).includes(role)) {
      sheetsKept.push(row);
      sheetsProtected.push(email);
      continue;
    }
    sheetsToDelete.push(email);
  }

  console.log(`\nFirestore — kept: ${fsSnapshot.size - fsToDelete.length - fsProtected.length}, protected: ${fsProtected.length}, TO DELETE: ${fsToDelete.length}`);
  console.log(`Sheets     — kept: ${sheetsKept.length}, protected: ${sheetsProtected.length}, TO DELETE: ${sheetsToDelete.length}\n`);

  if (fsToDelete.length === 0 && sheetsToDelete.length === 0) {
    console.log("Nothing to delete. Exiting.");
    process.exit(0);
  }

  console.log("--- Users targeted for deletion (Firestore) ---");
  fsToDelete.forEach((u) => console.log(`  - ${u.id}`));
  console.log("");

  // Always write backup, even in dry-run
  const backupPath = path.join(path.dirname(absPath), `deleted-users-backup-${Date.now()}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        firestore: fsToDelete,
        sheetsHeader: header,
        sheetsRowsDeleted: dataRows.filter((r) => sheetsToDelete.includes((r[2] || "").toLowerCase().trim())),
      },
      null,
      2
    )
  );
  console.log(`Backup written to: ${backupPath}\n`);

  if (dryRun) {
    console.log("--- DRY RUN: no deletions performed ---");
    console.log(`Re-run with --confirm-delete to permanently delete ${fsToDelete.length} users from Firestore and Sheets.\n`);
    process.exit(0);
  }

  console.log(`!!! CONFIRM-DELETE MODE: deleting ${fsToDelete.length} Firestore docs and rewriting Sheets !!!\n`);

  // Delete from Firestore
  const fsChunks = chunk(fsToDelete, BATCH_LIMIT);
  let fsDeleted = 0;
  for (const group of fsChunks) {
    const batch = db.batch();
    for (const u of group) batch.delete(db.collection(USERS_COLLECTION).doc(u.id));
    await batch.commit();
    fsDeleted += group.length;
    console.log(`  Firestore: deleted batch of ${group.length} (total ${fsDeleted}).`);
  }

  // Rewrite Sheets: clear the whole range, then write back header + kept rows only
  console.log("\n  Sheets: clearing users!A:R and rewriting surviving rows...");
  await clearSheetRange(accessToken, spreadsheetId, "users!A:R");
  const rewritten = [header, ...sheetsKept];
  const ok = await updateSheetValues(accessToken, spreadsheetId, "users!A1", rewritten);
  console.log(ok ? `  Sheets: rewrote ${sheetsKept.length} surviving rows.` : "  Sheets: REWRITE FAILED — check backup file and retry manually.");

  console.log("\n=== SUMMARY ===");
  console.log(`Firestore deleted: ${fsDeleted}`);
  console.log(`Sheets rows removed: ${sheetsToDelete.length}`);
  console.log(`Protected (never touched): ${fsProtected.length}`);
  console.log(`Backup file: ${backupPath}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});