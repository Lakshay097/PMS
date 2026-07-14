/**
 * scripts/add-users-from-csv.ts
 *
 * Add users if absent from CSV and assign or update teams from CSV.
 * CSV columns: Name, Email, ManagerMail, Role, Team
 * Data file: ./data/EcomTeamsData.csv
 *
 * Features:
 * - Adds users to Google Sheets and Firestore if they don't exist
 * - Updates existing users' team assignments and manager emails
 * - Supports dry-run mode (default) and execute mode (--execute flag)
 * - Handles multiple teams dynamically
 */

import * as dotenv from 'dotenv';
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const USERS_COLLECTION = "users";
const SHEET_RANGE = "users!A:Z";
const DATA_FILE = "EcomTeamsData.csv";

// Team ID mapping (update this as needed when new teams are added)
const TEAM_ID_MAPPING: Record<string, string> = {
  "Admin": "T-125",
  "Ecom - ERP & Tools": "T-210",
  "Software Purchase": "T-230",
  "Expansion": "T-263",
  "SCM": "T-267",
  "Warehouse": "T-293",
  "Expansion-School": "T-3",
  "Ecom - Purchase": "T-476",
  "Ecom - SST": "T-499",
  "Travel Desk": "T-5",
  "Ecom - Planning": "T-551",
  "Ecom - KAM": "T-593",
  "Ecom - Billing": "T-613",
  "Business Excellence": "T-7",
  "Infra Office/Corparate": "T-706",
  "ATL/BTL Marketing": "T-739",
  "Ecom - Printing": "T-771",
  "Global Management": "T-ALL",
};

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

async function appendSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<boolean> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    console.error(`appendSheetValues failed for range ${range}: HTTP ${res.status} - ${errText}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CsvRecord {
  name: string;
  email: string;
  managerMail: string;
  role: string;
  team: string;
}

interface ProcessingResult {
  name: string;
  email: string;
  managerMail: string;
  role: string;
  team: string;
  teamId: string;
  status: "to_add" | "to_update" | "error" | "missing_team_id";
  reason?: string;
}

// ---------------------------------------------------------------------------
// CSV loading
// ---------------------------------------------------------------------------
function loadCsvData(filePath: string): CsvRecord[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];

  if (records.length === 0) return [];

  const headers = Object.keys(records[0]);
  const nameHeader = headers.find((h) => h.trim().toLowerCase() === "name");
  const emailHeader = headers.find((h) => h.trim().toLowerCase() === "email");
  const managerHeader = headers.find((h) => h.trim().toLowerCase() === "managermail");
  const roleHeader = headers.find((h) => h.trim().toLowerCase() === "role");
  const teamHeader = headers.find((h) => h.trim().toLowerCase() === "team");

  if (!nameHeader || !emailHeader || !managerHeader || !teamHeader) {
    console.error(`CSV is missing required columns. Found: ${headers.join(", ")}`);
    console.error(`Required: Name, Email, ManagerMail, Team`);
    process.exit(1);
  }

  return records.map((r) => ({
    name: (r[nameHeader] || "").trim(),
    email: (r[emailHeader] || "").trim().toLowerCase(),
    managerMail: (r[managerHeader] || "").trim().toLowerCase(),
    role: roleHeader ? (r[roleHeader] || "").trim() : "",
    team: (r[teamHeader] || "").trim(),
  }));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Main processing
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const dryRun = !execute;

  const dataPath = path.join(__dirname, `../data/${DATA_FILE}`);

  if (!fs.existsSync(dataPath)) {
    console.error(`Data file not found: ${dataPath}`);
    process.exit(1);
  }

  console.log("=== Add Users from CSV ===\n");
  console.log(`Loading data from ${DATA_FILE}...`);
  const csvRecords = loadCsvData(dataPath);
  console.log(`Loaded ${csvRecords.length} records from CSV\n`);

  // Get team IDs for all teams in CSV
  const teamsInCsv = new Set(csvRecords.map(r => r.team));
  console.log(`Teams found in CSV: ${Array.from(teamsInCsv).join(", ")}\n`);

  // Check for missing team IDs
  const missingTeamIds: string[] = [];
  for (const team of teamsInCsv) {
    if (!TEAM_ID_MAPPING[team]) {
      missingTeamIds.push(team);
    }
  }

  if (missingTeamIds.length > 0) {
    console.error(`ERROR: Missing team IDs for the following teams:`);
    for (const team of missingTeamIds) {
      console.error(`  - "${team}"`);
    }
    console.error(`\nPlease add these teams to the TEAM_ID_MAPPING in the script.`);
    process.exit(1);
  }

  // Initialize services
  const db = getDb();
  const { accessToken, spreadsheetId } = await generateGoogleSheetsToken();

  console.log("Fetching users sheet for current data...");
  const sheetRows = await fetchSheetValues(accessToken, spreadsheetId, SHEET_RANGE);
  console.log(`Loaded ${sheetRows.length} rows from users sheet\n`);

  // Build email -> sheet row index map
  const emailToSheetRow = new Map<string, number>();
  for (let i = 1; i < sheetRows.length; i++) {
    const email = (sheetRows[i][2] || "").trim().toLowerCase();
    if (email) {
      emailToSheetRow.set(email, i);
    }
  }

  // Process each record
  const results: ProcessingResult[] = [];

  for (const record of csvRecords) {
    const teamId = TEAM_ID_MAPPING[record.team];
    
    if (!teamId) {
      results.push({
        name: record.name,
        email: record.email,
        managerMail: record.managerMail,
        role: record.role,
        team: record.team,
        teamId: "",
        status: "missing_team_id",
        reason: "No team ID mapping found"
      });
      continue;
    }

    const existingRowIndex = emailToSheetRow.get(record.email);
    
    if (existingRowIndex !== undefined) {
      // User exists - will update
      results.push({
        name: record.name,
        email: record.email,
        managerMail: record.managerMail,
        role: record.role,
        team: record.team,
        teamId: teamId,
        status: "to_update",
        reason: "User exists in system"
      });
    } else {
      // User doesn't exist - will add
      results.push({
        name: record.name,
        email: record.email,
        managerMail: record.managerMail,
        role: record.role,
        team: record.team,
        teamId: teamId,
        status: "to_add",
        reason: "User not in system"
      });
    }
  }

  // Print summary
  console.log("=== PROCESSING SUMMARY ===");
  console.log(`Total records: ${csvRecords.length}`);
  console.log(`To add: ${results.filter(r => r.status === "to_add").length}`);
  console.log(`To update: ${results.filter(r => r.status === "to_update").length}`);
  console.log(`Errors: ${results.filter(r => r.status === "error").length}\n`);

  // Group by team
  const byTeam = new Map<string, ProcessingResult[]>();
  for (const r of results) {
    if (!byTeam.has(r.team)) {
      byTeam.set(r.team, []);
    }
    byTeam.get(r.team)!.push(r);
  }

  console.log("=== BY TEAM ===");
  for (const [team, teamResults] of byTeam) {
    const toAdd = teamResults.filter(r => r.status === "to_add").length;
    const toUpdate = teamResults.filter(r => r.status === "to_update").length;
    console.log(`${team} (ID: ${TEAM_ID_MAPPING[team]}): ${toAdd} to add, ${toUpdate} to update`);
  }

  if (dryRun) {
    console.log("\n=== DRY RUN COMPLETE - NO CHANGES MADE ===");
    console.log("Run with --execute flag to actually add/update users");
    process.exit(0);
  }

  // --- EXECUTION PHASE ---
  console.log("\n=== EXECUTION MODE - WRITING CHANGES ===");
  
  const now = new Date().toISOString();
  const BATCH_LIMIT = 500;

  const toAdd = results.filter(r => r.status === "to_add");
  const toUpdate = results.filter(r => r.status === "to_update");

  // Process updates first
  if (toUpdate.length > 0) {
    console.log(`\nUpdating ${toUpdate.length} existing users...`);
    
    // Firestore batch updates
    console.log("Writing to Firestore...");
    const fsChunks = chunk(toUpdate, BATCH_LIMIT);
    let fsUpdated = 0;
    
    for (const group of fsChunks) {
      const batch = db.batch();
      for (const r of group) {
        const ref = db.collection(USERS_COLLECTION).doc(r.email);
        batch.update(ref, {
          TeamIDs: [r.teamId],
          TeamNames: [r.team],
          ManagerEmail: r.managerMail,
          Role: r.role,
          UpdatedAt: now
        });
      }
      await batch.commit();
      fsUpdated += group.length;
      console.log(`  Firestore: committed batch of ${group.length} (total: ${fsUpdated})`);
    }

    // Sheets updates (columns D, E, F, G = Role, ManagerEmail, TeamID, TeamName)
    console.log("\nWriting to Google Sheets...");
    let sheetsUpdated = 0;
    const sheetsErrors: { email: string; reason: string }[] = [];

    for (const r of toUpdate) {
      const rowIndex = emailToSheetRow.get(r.email);
      if (rowIndex === undefined) {
        sheetsErrors.push({ email: r.email, reason: "Email not found in sheet" });
        continue;
      }

      const sheetRow = rowIndex + 1;
      const ok = await updateSheetValues(accessToken, spreadsheetId, `users!D${sheetRow}:G${sheetRow}`, [
        [r.role, r.managerMail, r.teamId, r.team],
      ]);

      if (ok) {
        sheetsUpdated++;
      } else {
        sheetsErrors.push({ email: r.email, reason: "Sheets update failed" });
      }
    }

    console.log(`  Sheets: updated ${sheetsUpdated} rows`);

    if (sheetsErrors.length > 0) {
      console.log("\nSheets update errors:");
      sheetsErrors.forEach(e => console.log(`  - ${e.email}: ${e.reason}`));
    }
  }

  // Process additions
  if (toAdd.length > 0) {
    console.log(`\nAdding ${toAdd.length} new users...`);
    
    // Get the next UserID
    const maxUserId = sheetRows.length > 0 ? sheetRows.length : 0;
    
    // Firestore additions
    console.log("Writing to Firestore...");
    let fsAdded = 0;
    
    for (const r of toAdd) {
      try {
        await db.collection(USERS_COLLECTION).doc(r.email).set({
          UserID: r.email,
          FullName: r.name,
          Email: r.email,
          Role: r.role,
          ManagerEmail: r.managerMail,
          TeamIDs: [r.teamId],
          TeamNames: [r.team],
          Active: true,
          CreatedAt: now,
          UpdatedAt: now
        });
        fsAdded++;
      } catch (error) {
        console.error(`  Error adding ${r.email} to Firestore:`, error);
      }
    }
    console.log(`  Firestore: added ${fsAdded} users`);

    // Sheets additions
    console.log("\nWriting to Google Sheets...");
    let sheetsAdded = 0;
    const sheetsErrors: { email: string; reason: string }[] = [];

    for (let i = 0; i < toAdd.length; i++) {
      const r = toAdd[i];
      const newUserId = (maxUserId + i + 1).toString();
      
      const newRow = [
        newUserId,
        r.name,
        r.email,
        r.role,
        r.managerMail,
        r.teamId,
        r.team,
        'Yes' // Active
      ];

      const ok = await appendSheetValues(accessToken, spreadsheetId, 'users!A:H', [newRow]);

      if (ok) {
        sheetsAdded++;
      } else {
        sheetsErrors.push({ email: r.email, reason: "Sheets append failed" });
      }
    }

    console.log(`  Sheets: added ${sheetsAdded} rows`);

    if (sheetsErrors.length > 0) {
      console.log("\nSheets addition errors:");
      sheetsErrors.forEach(e => console.log(`  - ${e.email}: ${e.reason}`));
    }
  }

  console.log("\n=== EXECUTION SUMMARY ===");
  console.log(`Users added: ${toAdd.length}`);
  console.log(`Users updated: ${toUpdate.length}`);
  console.log(`Firestore operations completed`);
  console.log(`Google Sheets operations completed`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
