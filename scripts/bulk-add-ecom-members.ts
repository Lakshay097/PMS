/**
 * scripts/bulk-add-ecom-members.ts
 *
 * Cross-reference new Name→Email→Manager Email data against existing team-assignments.csv
 * to complete E-Com bulk member-add with manager email assignment.
 *
 * Key requirements:
 * - Match by full name against the earlier PW-ID list to get each person's email and manager's email
 * - Flag duplicate name conflicts (Abhay Pratap Singh) without guessing
 * - Skip Mihir Prateek and "Rishabh ." (no email data)
 * - Add members to E-Com team if not already members
 * - Store Manager Email against user records (field already exists as ManagerEmail in column E)
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const USERS_COLLECTION = "users";
const ECOM_TEAM_ID = "T-6";
const ECOM_TEAM_NAME = "e-com";
const SHEET_RANGE = "users!A:R";

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface NewDataRecord {
  name: string;
  email: string;
  managerEmail: string;
  employeeId?: string;
}

interface ExistingRecord {
  name: string;
  email: string;
  managerMail: string;
  role: string;
  team: string;
}

interface ProcessingResult {
  name: string;
  email: string;
  managerEmail: string;
  status: "added" | "skipped" | "error" | "conflict" | "missing_email";
  reason?: string;
  conflictDetails?: string;
}

// ---------------------------------------------------------------------------
// CSV loading
// ---------------------------------------------------------------------------
function loadNewData(filePath: string): NewDataRecord[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];

  if (records.length === 0) return [];

  const headers = Object.keys(records[0]);
  const nameHeader = headers.find((h) => h.trim().toLowerCase() === "name");
  const emailHeader = headers.find((h) => h.trim().toLowerCase() === "email");
  const managerHeader = headers.find((h) => h.trim().toLowerCase() === "manager email");
  const employeeIdHeader = headers.find((h) => h.trim().toLowerCase() === "employee id");

  if (!nameHeader || !emailHeader || !managerHeader) {
    console.error(`CSV is missing required columns. Found: ${headers.join(", ")}`);
    process.exit(1);
  }

  return records.map((r) => ({
    name: (r[nameHeader] || "").trim(),
    email: (r[emailHeader] || "").trim().toLowerCase(),
    managerEmail: (r[managerHeader] || "").trim().toLowerCase(),
    employeeId: employeeIdHeader ? (r[employeeIdHeader] || "").trim() : undefined,
  }));
}

function loadExistingData(filePath: string): ExistingRecord[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];

  if (records.length === 0) return [];

  const headers = Object.keys(records[0]);
  const nameHeader = headers.find((h) => h.trim().toLowerCase() === "name");
  const emailHeader = headers.find((h) => h.trim().toLowerCase() === "email");
  const managerHeader = headers.find((h) => h.trim().toLowerCase() === "managermail");
  const roleHeader = headers.find((h) => h.trim().toLowerCase() === "role");
  const teamHeader = headers.find((h) => h.trim().toLowerCase() === "team");

  return records.map((r) => ({
    name: nameHeader ? (r[nameHeader] || "").trim() : "",
    email: emailHeader ? (r[emailHeader] || "").trim().toLowerCase() : "",
    managerMail: managerHeader ? (r[managerHeader] || "").trim().toLowerCase() : "",
    role: roleHeader ? (r[roleHeader] || "").trim() : "",
    team: teamHeader ? (r[teamHeader] || "").trim() : "",
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

  const newDataPath = path.join(__dirname, "../data/ecom-new-data.csv");
  const existingDataPath = path.join(__dirname, "../data/team-assignments.csv");

  if (!fs.existsSync(newDataPath)) {
    console.error(`New data file not found: ${newDataPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(existingDataPath)) {
    console.error(`Existing data file not found: ${existingDataPath}`);
    process.exit(1);
  }

  console.log("Loading new data...");
  const newRecords = loadNewData(newDataPath);
  console.log(`Loaded ${newRecords.length} records from new data`);

  console.log("Loading existing team-assignments.csv...");
  const existingRecords = loadExistingData(existingDataPath);
  console.log(`Loaded ${existingRecords.length} records from existing data`);

  // Build name -> existing records map for matching
  const nameToExisting = new Map<string, ExistingRecord[]>();
  for (const rec of existingRecords) {
    const normalizedName = rec.name.toLowerCase().trim();
    if (!nameToExisting.has(normalizedName)) {
      nameToExisting.set(normalizedName, []);
    }
    nameToExisting.get(normalizedName)!.push(rec);
  }

  // Build email -> existing record map for checking existing team membership
  const emailToExisting = new Map<string, ExistingRecord>();
  for (const rec of existingRecords) {
    if (rec.email) {
      emailToExisting.set(rec.email, rec);
    }
  }

  // First, detect duplicate names in NEW data and check if they can be resolved by Employee ID
  const nameToNewRecords = new Map<string, NewDataRecord[]>();
  for (const rec of newRecords) {
    const normalizedName = rec.name.toLowerCase().trim();
    if (!nameToNewRecords.has(normalizedName)) {
      nameToNewRecords.set(normalizedName, []);
    }
    nameToNewRecords.get(normalizedName)!.push(rec);
  }

  const results: ProcessingResult[] = [];
  const conflicts: { name: string; emails: string[]; managerEmails: string[]; employeeIds?: string[] }[] = [];
  const missingEmails: string[] = [];
  const notInNewData: string[] = [];

  // Find people in existing data who are NOT in new data (Mihir Prateek, Rishabh ., etc.)
  for (const existingRec of existingRecords) {
    const normalizedName = existingRec.name.toLowerCase().trim();
    const foundInNew = nameToNewRecords.get(normalizedName);
    if (!foundInNew || foundInNew.length === 0) {
      notInNewData.push(existingRec.name);
    }
  }

  // Process each new record
  for (const newRec of newRecords) {
    const normalizedName = newRec.name.toLowerCase().trim();
    
    // Check for missing email
    if (!newRec.email || newRec.email === "" || newRec.email === "#n/a") {
      results.push({
        name: newRec.name,
        email: newRec.email,
        managerEmail: newRec.managerEmail,
        status: "missing_email",
        reason: "No email provided in new data"
      });
      missingEmails.push(newRec.name);
      continue;
    }

    // Check for duplicate name conflicts in NEW data
    const newMatches = nameToNewRecords.get(normalizedName);
    if (newMatches && newMatches.length > 1) {
      // Check if all duplicates have unique Employee IDs - if so, no conflict
      const employeeIds = newMatches.map(r => r.employeeId).filter(e => e && e.trim() !== "");
      const uniqueEmployeeIds = new Set(employeeIds);
      
      if (employeeIds.length === newMatches.length && uniqueEmployeeIds.size === newMatches.length) {
        // All have unique Employee IDs - can process normally
        // Just add a note about the disambiguation
        results.push({
          name: newRec.name,
          email: newRec.email,
          managerEmail: newRec.managerEmail,
          status: "added",
          reason: `Will be added to E-Com team with manager email (disambiguated by Employee ID: ${newRec.employeeId})`
        });
      } else {
        // True conflict - cannot disambiguate
        const emails = newMatches.map(r => r.email).filter(e => e);
        const managerEmails = newMatches.map(r => r.managerEmail).filter(e => e);
        // Only add conflict once per name
        if (!conflicts.find(c => c.name.toLowerCase() === normalizedName)) {
          conflicts.push({ 
            name: newRec.name, 
            emails, 
            managerEmails,
            employeeIds: employeeIds.length > 0 ? employeeIds : undefined
          });
        }
        results.push({
          name: newRec.name,
          email: newRec.email,
          managerEmail: newRec.managerEmail,
          status: "conflict",
          reason: "Duplicate name in new data - cannot disambiguate without unique Employee IDs",
          conflictDetails: `Emails in new data: ${emails.join(", ")}, Managers: ${managerEmails.join(", ")}${employeeIds.length > 0 ? `, Employee IDs: ${employeeIds.join(", ")}` : ""}`
        });
        continue;
      }
    } else {
      // No duplicate name - process normally
      // Check if already in E-Com team (from existing data)
      const existingByEmail = emailToExisting.get(newRec.email);
      if (existingByEmail) {
        const existingTeam = existingByEmail.team.toLowerCase();
        if (existingTeam.includes("e-com") || existingTeam === "e-com") {
          results.push({
            name: newRec.name,
            email: newRec.email,
            managerEmail: newRec.managerEmail,
            status: "skipped",
            reason: "Already a member of E-Com team"
          });
          continue;
        }
      }

      // Ready to add
      results.push({
        name: newRec.name,
        email: newRec.email,
        managerEmail: newRec.managerEmail,
        status: "added",
        reason: "Will be added to E-Com team with manager email"
      });
    }
  }

  // Print results
  console.log("\n=== PROCESSING RESULTS ===");
  console.log(`Total records processed: ${newRecords.length}`);
  console.log(`To be added: ${results.filter(r => r.status === "added").length}`);
  console.log(`Skipped (already member): ${results.filter(r => r.status === "skipped").length}`);
  console.log(`Conflicts: ${results.filter(r => r.status === "conflict").length}`);
  console.log(`Missing emails: ${results.filter(r => r.status === "missing_email").length}`);

  if (conflicts.length > 0) {
    console.log("\n=== CONFLICTS (require manual resolution) ===");
    for (const conflict of conflicts) {
      console.log(`- ${conflict.name}: Multiple matches found with emails: ${conflict.emails.join(", ")}`);
    }
  }

  if (missingEmails.length > 0) {
    console.log("\n=== MISSING EMAILS (skipped) ===");
    for (const name of missingEmails) {
      console.log(`- ${name}: No email provided in new data`);
    }
  }

  if (notInNewData.length > 0) {
    console.log("\n=== IN EXISTING DATA BUT NOT IN NEW DATA (may need emails chased down) ===");
    for (const name of notInNewData) {
      console.log(`- ${name}: Not found in new data - may need email chased down`);
    }
  }

  console.log("\n=== RECORDS TO BE ADDED ===");
  const toAdd = results.filter(r => r.status === "added");
  for (const rec of toAdd) {
    console.log(`- ${rec.name} (${rec.email}) -> Manager: ${rec.managerEmail}`);
  }

  // Write detailed report
  const reportPath = path.join(__dirname, "../data/ecom-bulk-add-report.json");
  fs.writeFileSync(reportPath, JSON.stringify({
    summary: {
      total: newRecords.length,
      added: toAdd.length,
      skipped: results.filter(r => r.status === "skipped").length,
      conflicts: conflicts.length,
      missingEmails: missingEmails.length,
      notInNewData: notInNewData.length
    },
    conflicts,
    missingEmails,
    notInNewData,
    toAdd,
    allResults: results
  }, null, 2));
  console.log(`\nDetailed report written to: ${reportPath}`);

  console.log("\n=== NEXT STEPS ===");
  console.log("1. Review conflicts above and resolve manually if needed");
  console.log("2. Chase down missing emails for: " + missingEmails.join(", "));

  // --- ANALYSIS PHASE (both dry-run and execute) ---
  console.log("\n=== CHECKING USER ACCOUNT EXISTENCE ===");
  
  const db = getDb();
  const { accessToken, spreadsheetId } = await generateGoogleSheetsToken();

  console.log("Fetching users sheet for current data...");
  const sheetRows = await fetchSheetValues(accessToken, spreadsheetId, SHEET_RANGE);
  console.log(`Loaded ${sheetRows.length} rows from users sheet`);

  // Build email -> sheet row index map
  const emailToSheetRow = new Map<string, number>();
  for (let i = 1; i < sheetRows.length; i++) {
    const email = (sheetRows[i][2] || "").trim().toLowerCase();
    if (email) {
      emailToSheetRow.set(email, i);
    }
  }

  const toUpdate = toAdd.filter(r => emailToSheetRow.has(r.email));
  const notInSystem = toAdd.filter(r => !emailToSheetRow.has(r.email));
  
  console.log(`\nUsers with existing accounts (can be added): ${toUpdate.length}`);
  console.log(`Users without accounts (will be skipped): ${notInSystem.length}`);
  
  if (notInSystem.length > 0) {
    console.log("\n=== USERS SKIPPED - NO USER ACCOUNT IN SYSTEM ===");
    notInSystem.forEach(r => {
      console.log(`- ${r.name} (${r.email}): Email not found in users sheet`);
    });
  }

  if (dryRun) {
    console.log("\n=== DRY RUN COMPLETE - NO CHANGES MADE ===");
    console.log("Run with --execute flag to actually add members to E-Com team and update manager emails");
    process.exit(0);
  }

  // --- EXECUTION PHASE ---
  console.log("\n=== EXECUTION MODE - WRITING CHANGES ===");
  
  const now = new Date().toISOString();
  const BATCH_LIMIT = 500;

  console.log(`\nPreparing to update ${toUpdate.length} users in Firestore and Sheets`);

  // Firestore batch updates
  console.log("Writing to Firestore...");
  const fsChunks = chunk(toUpdate, BATCH_LIMIT);
  let fsUpdated = 0;
  
  for (const group of fsChunks) {
    const batch = db.batch();
    for (const r of group) {
      const ref = db.collection(USERS_COLLECTION).doc(r.email);
      batch.update(ref, {
        TeamIDs: [ECOM_TEAM_ID],
        TeamNames: [ECOM_TEAM_NAME],
        ManagerEmail: r.managerEmail,
        UpdatedAt: now
      });
    }
    await batch.commit();
    fsUpdated += group.length;
    console.log(`  Firestore: committed batch of ${group.length} (total: ${fsUpdated})`);
  }

  // Sheets updates (columns E, F, G = ManagerEmail, TeamID, TeamName)
  console.log("\nWriting to Google Sheets...");
  let sheetsUpdated = 0;
  const sheetsErrors: { email: string; reason: string }[] = [];

  for (const r of toUpdate) {
    const rowIndex = emailToSheetRow.get(r.email);
    if (rowIndex === undefined) {
      sheetsErrors.push({ email: r.email, reason: "Email not found in sheet" });
      continue;
    }

    const sheetRow = rowIndex + 1; // A1 notation is 1-indexed
    const ok = await updateSheetValues(accessToken, spreadsheetId, `users!E${sheetRow}:G${sheetRow}`, [
      [r.managerEmail, ECOM_TEAM_ID, ECOM_TEAM_NAME],
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

  console.log("\n=== EXECUTION SUMMARY ===");
  console.log(`Firestore updates: ${fsUpdated}`);
  console.log(`Sheets updates: ${sheetsUpdated}`);
  console.log(`Sheets errors: ${sheetsErrors.length}`);
  console.log(`Conflicts (skipped): ${conflicts.length}`);
  console.log(`Missing emails (skipped): ${missingEmails.length}`);
  console.log(`Not in new data (skipped): ${notInNewData.length}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
