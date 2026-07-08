/**
 * scripts/bulk-assign-team.ts
 *
 * ONE-TIME SCRIPT: Bulk-assign existing users to a team from a CSV file.
 * Writes to BOTH Firestore and Google Sheets (Sheets is what login/auth reads from).
 *
 * CSV format required:
 *   email,team
 *   john@x.com,Expansion
 *   jane@x.com,TEAM_ID_ABC123    <- a raw TeamID also works if you already have one
 *
 * NOTE: This schema has no per-user "sub-team" field — sub-team membership lives in a
 * separate sub_teams sheet (SubTeamID, TeamID, SubTeamName, Active, ...leader emails).
 * If you need sub-team assignment too, tell me how sub-team membership should be
 * represented (e.g. added to a leaderEmails list) and I'll add it as a separate step.
 *
 * Usage:
 *   npx ts-node -r dotenv/config scripts/bulk-assign-team.ts ./data/team-assignments.csv --dry-run
 *   npx ts-node -r dotenv/config scripts/bulk-assign-team.ts ./data/team-assignments.csv --execute
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
// CONFIG
// ---------------------------------------------------------------------------
const USERS_COLLECTION = "users";
const BATCH_LIMIT = 500;

// ---------------------------------------------------------------------------
// Firebase init (Firestore)
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
// Google Sheets auth + helpers — mirrors server/services/googleSheetsService.ts
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
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error(`Google SA token fetch failed (HTTP ${tokenRes.status}): ${errText}`);
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
    const errText = await res.text();
    console.error(`updateSheetValues failed for range ${range}: HTTP ${res.status} - ${errText}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Types + CSV
// ---------------------------------------------------------------------------
interface CsvRow {
  email: string;
  team: string; // team name OR a raw TeamID
}

interface RowResult {
  email: string;
  team: string;
  status: "updated" | "error";
  reason?: string;
}

function loadCsv(filePath: string): CsvRow[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  return records.map((r) => ({
    email: (r.email || "").toLowerCase().trim(),
    team: (r.team || "").trim(),
  }));
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
  const execute = args.includes("--execute");
  const dryRun = !execute;

  if (!csvPath) {
    console.error("Usage: npx ts-node scripts/bulk-assign-team.ts <path-to-csv> [--dry-run | --execute]");
    process.exit(1);
  }
  const absPath = path.resolve(csvPath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const db = getDb();
  const { accessToken, spreadsheetId } = await generateGoogleSheetsToken();

  console.log(`\nLoading CSV: ${absPath}`);
  const rows = loadCsv(absPath);
  console.log(`Found ${rows.length} rows.\n`);

  // Resolve team names -> TeamIDs using the 'teams' sheet (TeamID=A, TeamName=B, Active=D)
  console.log("Fetching teams list from Sheets...");
  const teamsRows = await fetchSheetValues(accessToken, spreadsheetId, "teams!A:D");
  const nameToId = new Map<string, string>();
  const validIds = new Set<string>();
  for (let i = 1; i < teamsRows.length; i++) {
    const [teamId, teamName] = teamsRows[i];
    if (teamId) validIds.add(teamId);
    if (teamId && teamName) nameToId.set(teamName.toLowerCase(), teamId);
  }
  console.log(`Loaded ${validIds.size} teams.\n`);

  // Fetch all user rows once (email in column C -> index 2)
  console.log("Fetching users sheet...");
  const userRows = await fetchSheetValues(accessToken, spreadsheetId, "users!A:R");
  const emailToRowIndex = new Map<string, number>(); // email -> 0-based index within userRows (row 0 = header)
  for (let i = 1; i < userRows.length; i++) {
    const email = (userRows[i][2] || "").toLowerCase().trim();
    if (email) emailToRowIndex.set(email, i);
  }
  console.log(`Loaded ${emailToRowIndex.size} user rows from Sheets.\n`);

  const results: RowResult[] = [];
  const resolved: { email: string; team: string; teamId: string; teamName: string }[] = [];

  for (const row of rows) {
    if (!row.email || !row.team) {
      results.push({ ...row, status: "error", reason: "Missing email or team" });
      continue;
    }
    let teamId = "";
    let teamName = "";
    if (validIds.has(row.team)) {
      teamId = row.team;
      teamName = teamsRows.find((r) => r[0] === row.team)?.[1] || "";
    } else if (nameToId.has(row.team.toLowerCase())) {
      teamId = nameToId.get(row.team.toLowerCase())!;
      teamName = row.team;
    } else {
      results.push({ ...row, status: "error", reason: `Team "${row.team}" not found in teams sheet` });
      continue;
    }

    if (!emailToRowIndex.has(row.email)) {
      results.push({ ...row, status: "error", reason: "User not found (missing from Sheets users tab)" });
      continue;
    }

    resolved.push({ email: row.email, team: row.team, teamId, teamName });
  }

  console.log(`Resolved and ready: ${resolved.length}`);
  console.log(`Errors: ${results.filter((r) => r.status === "error").length}\n`);

  if (dryRun) {
    console.log("--- DRY RUN: no writes will be made ---\n");
    for (const r of resolved) {
      console.log(`Would update ${r.email} -> TeamID=${r.teamId}, TeamName=${r.teamName}`);
    }
    console.log(`\nRe-run with --execute to write to Firestore + Sheets for real.\n`);
    process.exit(0);
  }

  const now = new Date().toISOString();

  // --- Firestore writes (batched) ---
  console.log("Writing to Firestore...");
  const fsChunks = chunk(resolved, BATCH_LIMIT);
  for (const group of fsChunks) {
    const batch = db.batch();
    for (const r of group) {
      const ref = db.collection(USERS_COLLECTION).doc(r.email);
      batch.update(ref, {
        TeamID: r.teamId,
        TeamName: r.teamName,
        TeamIDs: [r.teamId],
        TeamNames: [r.teamName],
        UpdatedAt: now,
      });
    }
    await batch.commit();
    console.log(`  Firestore: committed batch of ${group.length}.`);
  }

  // --- Sheets writes (one row at a time — Sheets API has no multi-range batch-by-row
  // update helper reused here; we update columns F,G,L for each matched row) ---
  console.log("\nWriting to Google Sheets...");
  let sheetsUpdated = 0;
  for (const r of resolved) {
    const rowIdx = emailToRowIndex.get(r.email)!;
    const sheetRow = rowIdx + 1; // A1 notation is 1-indexed
    const ok = await updateSheetValues(accessToken, spreadsheetId, `users!F${sheetRow}:G${sheetRow}`, [
      [r.teamId, r.teamName],
    ]);
    await updateSheetValues(accessToken, spreadsheetId, `users!L${sheetRow}:L${sheetRow}`, [[now]]);
    if (ok) {
      sheetsUpdated++;
      results.push({ email: r.email, team: r.team, status: "updated" });
    } else {
      results.push({ email: r.email, team: r.team, status: "error", reason: "Sheets update failed" });
    }
  }
  console.log(`  Sheets: updated ${sheetsUpdated} rows.\n`);

  const updated = results.filter((r) => r.status === "updated").length;
  const errors = results.filter((r) => r.status === "error");

  console.log("=== SUMMARY ===");
  console.log(`Total rows processed: ${rows.length}`);
  console.log(`Updated (Firestore + Sheets): ${updated}`);
  console.log(`Errors: ${errors.length}`);
  if (errors.length) {
    console.log("\nFailed rows:");
    errors.forEach((e) => console.log(`  - ${e.email}: ${e.reason}`));
  }

  const reportPath = path.join(path.dirname(absPath), `assignment-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed report written to: ${reportPath}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});