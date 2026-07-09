/**
 * scripts/migrate-roles-to-substakeholder.ts
 *
 * ONE-TIME SCRIPT: Migrate Stakeholder users to Sub-stakeholder based on sub-team leadership.
 * Writes to BOTH Firestore and Google Sheets (Sheets is what login/auth reads from).
 *
 * Logic:
 *   - Reads sub_teams sheet to identify sub-team leaders
 *   - Finds users who are sub-team leaders but have Role = "Stakeholder"
 *   - Updates their Role to "Sub-stakeholder" in both Firestore and Google Sheets
 *
 * Usage:
 *   npx ts-node -r dotenv/config scripts/migrate-roles-to-substakeholder.ts --dry-run
 *   npx ts-node -r dotenv/config scripts/migrate-roles-to-substakeholder.ts --execute
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
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
// Types
// ---------------------------------------------------------------------------
interface MigrationResult {
  email: string;
  oldRole: string;
  newRole: string;
  subTeamName: string;
  status: "updated" | "error";
  reason?: string;
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
  const execute = args.includes("--execute");
  const dryRun = !execute;

  console.log(`\nMode: ${dryRun ? "DRY RUN" : "EXECUTE"}\n`);

  const db = getDb();
  const { accessToken, spreadsheetId } = await generateGoogleSheetsToken();

  // Fetch sub-teams to identify sub-team leaders
  console.log("Fetching sub_teams sheet...");
  const subTeamsRows = await fetchSheetValues(accessToken, spreadsheetId, "sub_teams!A:E");
  const subTeamLeaders = new Map<string, { subTeamId: string; subTeamName: string }>(); // email -> sub-team info
  
  for (let i = 1; i < subTeamsRows.length; i++) {
    const [subTeamId, teamId, subTeamName, active, leaderEmails] = subTeamsRows[i];
    if (active !== "true" && active !== "TRUE") continue;
    
    // Parse leader emails (comma-separated)
    const leaders = leaderEmails ? leaderEmails.split(",").map((e: string) => e.trim().toLowerCase()) : [];
    for (const leader of leaders) {
      if (leader) {
        subTeamLeaders.set(leader, { subTeamId, subTeamName });
      }
    }
  }
  console.log(`Found ${subTeamLeaders.size} sub-team leaders.\n`);

  // Fetch all user rows
  console.log("Fetching users sheet...");
  const userRows = await fetchSheetValues(accessToken, spreadsheetId, "users!A:R");
  const emailToRowIndex = new Map<string, number>(); // email -> 0-based index within userRows
  const emailToRole = new Map<string, string>(); // email -> current role
  
  for (let i = 1; i < userRows.length; i++) {
    const email = (userRows[i][2] || "").toLowerCase().trim();
    const role = userRows[i][3] || ""; // Role is in column D (index 3)
    if (email) {
      emailToRowIndex.set(email, i);
      emailToRole.set(email, role);
    }
  }
  console.log(`Loaded ${emailToRowIndex.size} user rows from Sheets.\n`);

  // Identify users who need migration
  const toMigrate: Array<{ email: string; oldRole: string; subTeamName: string; rowIndex: number }> = [];
  
  for (const [email, subTeamInfo] of subTeamLeaders) {
    const currentRole = emailToRole.get(email);
    if (!currentRole) {
      console.log(`Skipping ${email}: user not found in users sheet`);
      continue;
    }
    
    if (currentRole === "Stakeholder" || currentRole === "stakeholder") {
      const rowIndex = emailToRowIndex.get(email)!;
      toMigrate.push({
        email,
        oldRole: currentRole,
        subTeamName: subTeamInfo.subTeamName,
        rowIndex,
      });
    } else if (currentRole === "Sub-stakeholder" || currentRole === "sub-stakeholder") {
      console.log(`Skipping ${email}: already has role ${currentRole}`);
    } else {
      console.log(`Skipping ${email}: has role ${currentRole} (not Stakeholder)`);
    }
  }

  console.log(`\nUsers to migrate: ${toMigrate.length}\n`);

  if (dryRun) {
    console.log("--- DRY RUN: no writes will be made ---\n");
    for (const m of toMigrate) {
      console.log(`Would migrate ${m.email}: ${m.oldRole} -> Sub-stakeholder (sub-team: ${m.subTeamName})`);
    }
    console.log(`\nRe-run with --execute to write to Firestore + Sheets for real.\n`);
    process.exit(0);
  }

  const now = new Date().toISOString();
  const results: MigrationResult[] = [];

  // --- Firestore writes (batched) ---
  console.log("Writing to Firestore...");
  const fsChunks = chunk(toMigrate, BATCH_LIMIT);
  for (const group of fsChunks) {
    const batch = db.batch();
    for (const m of group) {
      const ref = db.collection(USERS_COLLECTION).doc(m.email);
      batch.update(ref, {
        Role: "Sub-stakeholder",
        UpdatedAt: now,
      });
    }
    await batch.commit();
    console.log(`  Firestore: committed batch of ${group.length}.`);
  }

  // --- Sheets writes (update column D for each matched row) ---
  console.log("\nWriting to Google Sheets...");
  let sheetsUpdated = 0;
  for (const m of toMigrate) {
    const sheetRow = m.rowIndex + 1; // A1 notation is 1-indexed
    const ok = await updateSheetValues(accessToken, spreadsheetId, `users!D${sheetRow}:D${sheetRow}`, [["Sub-stakeholder"]]);
    await updateSheetValues(accessToken, spreadsheetId, `users!L${sheetRow}:L${sheetRow}`, [[now]]);
    if (ok) {
      sheetsUpdated++;
      results.push({
        email: m.email,
        oldRole: m.oldRole,
        newRole: "Sub-stakeholder",
        subTeamName: m.subTeamName,
        status: "updated",
      });
    } else {
      results.push({
        email: m.email,
        oldRole: m.oldRole,
        newRole: "Sub-stakeholder",
        subTeamName: m.subTeamName,
        status: "error",
        reason: "Sheets update failed",
      });
    }
  }
  console.log(`  Sheets: updated ${sheetsUpdated} rows.\n`);

  const updated = results.filter((r) => r.status === "updated").length;
  const errors = results.filter((r) => r.status === "error");

  console.log("=== SUMMARY ===");
  console.log(`Total sub-team leaders found: ${subTeamLeaders.size}`);
  console.log(`Users migrated: ${updated}`);
  console.log(`Errors: ${errors.length}`);
  if (errors.length) {
    console.log("\nFailed migrations:");
    errors.forEach((e) => console.log(`  - ${e.email}: ${e.reason}`));
  }

  const reportPath = path.join(__dirname, `role-migration-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed report written to: ${reportPath}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
