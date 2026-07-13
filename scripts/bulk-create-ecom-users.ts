import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';
import bcrypt from 'bcrypt';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const ECOM_TEAM_ID = 'T-6';
const ECOM_TEAM_NAME = 'e-com';
const DEFAULT_PASSWORD = '123456';
const DEFAULT_ROLE = 'Sub-stakeholder'; // Regular member, not leader/stakeholder
const SHEET_RANGE = 'users!A:R';
const USERS_COLLECTION = 'users';

// ---------------------------------------------------------------------------
// Firebase init
// ---------------------------------------------------------------------------
function getDb() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  const missing: string[] = [];
  if (!projectId) missing.push("FIREBASE_PROJECT_ID");
  if (!clientEmail) missing.push("FIREBASE_ADMIN_CLIENT_EMAIL");
  if (!privateKey) missing.push("FIREBASE_ADMIN_PRIVATE_KEY");
  if (missing.length > 0) {
    console.error(`Missing Firebase env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  const existingApp = getApps().find((app) => app.name === "pms-admin");
  if (existingApp) {
    return getFirestore(existingApp);
  }

  const app = initializeApp(
    {
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    },
    "pms-admin"
  );
  return getFirestore(app);
}

// ---------------------------------------------------------------------------
// Google Sheets functions
// ---------------------------------------------------------------------------
async function generateGoogleSheetsToken() {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  if (!serviceAccountEmail || !privateKey || !spreadsheetId) {
    console.error('Missing Google Sheets env vars');
    return null;
  }

  // Create JWT
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccountEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const headerBase64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signatureInput = `${headerBase64}.${payloadBase64}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  sign.end();
  const signature = sign.sign(privateKey).toString('base64url');

  const jwt = `${signatureInput}.${signature}`;

  // Exchange JWT for access token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to get Google Sheets token:', errorText);
    return null;
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    spreadsheetId,
  };
}

async function fetchSheetValues(accessToken: string, spreadsheetId: string, range: string): Promise<any[][] | null> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to fetch sheet values: ${errorText}`);
    return null;
  }

  const data = await response.json();
  return data.values || [];
}

async function appendSheetValues(accessToken: string, spreadsheetId: string, sheetName: string, values: any[][]): Promise<boolean> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}:append?valueInputOption=RAW`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to append sheet values: ${errorText}`);
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface NewUserData {
  name: string;
  email: string;
  managerEmail: string;
  employeeId?: string;
}

interface UserToCreate {
  FullName: string;
  Email: string;
  Role: string;
  ManagerEmail: string;
  TeamID: string;
  TeamName: string;
  Password: string;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------
function generateUserId(): string {
  return `USR-${Math.floor(100 + Math.random() * 899)}`;
}

function loadNewData(filePath: string): NewUserData[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];

  if (records.length === 0) return [];

  const headers = Object.keys(records[0]);
  const nameHeader = headers.find((h) => h.trim().toLowerCase() === 'name');
  const emailHeader = headers.find((h) => h.trim().toLowerCase() === 'email');
  const managerHeader = headers.find((h) => h.trim().toLowerCase() === 'manager email');
  const employeeIdHeader = headers.find((h) => h.trim().toLowerCase() === 'employee id');

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

// ---------------------------------------------------------------------------
// Main processing
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const dryRun = !execute;

  const newDataPath = path.join(__dirname, '../data/ecom-new-data.csv');

  if (!fs.existsSync(newDataPath)) {
    console.error(`New data file not found: ${newDataPath}`);
    process.exit(1);
  }

  console.log('Loading new data...');
  const newRecords = loadNewData(newDataPath);
  console.log(`Loaded ${newRecords.length} records from new data`);

  // Get Google Sheets token
  const tokenData = await generateGoogleSheetsToken();
  if (!tokenData) {
    console.error('Failed to authenticate with Google Sheets');
    process.exit(1);
  }

  const spreadsheetId = tokenData.spreadsheetId;
  if (!spreadsheetId) {
    console.error('Spreadsheet ID not found');
    process.exit(1);
  }

  // Fetch existing users to check for duplicates
  console.log('Fetching existing users from Google Sheets...');
  const existingUsers = await fetchSheetValues(tokenData.accessToken, spreadsheetId, SHEET_RANGE);
  if (!existingUsers) {
    console.error('Failed to fetch existing users');
    process.exit(1);
  }

  console.log(`Loaded ${existingUsers.length} rows from users sheet`);

  // Build email set for duplicate checking
  const existingEmails = new Set(
    existingUsers.slice(1).map(row => row[2]?.toLowerCase()).filter(Boolean)
  );

  // Filter out users who already exist and identify users to create
  const usersToCreate: UserToCreate[] = [];
  const skippedUsers: { name: string; email: string; reason: string }[] = [];
  const duplicateConflicts: { name: string; emails: string[] }[] = [];

  // First, check for duplicate names in new data
  const nameToNewRecords = new Map<string, NewUserData[]>();
  for (const rec of newRecords) {
    const normalizedName = rec.name.toLowerCase().trim();
    if (!nameToNewRecords.has(normalizedName)) {
      nameToNewRecords.set(normalizedName, []);
    }
    nameToNewRecords.get(normalizedName)!.push(rec);
  }

  // Process each new record
  for (const newRec of newRecords) {
    const normalizedName = newRec.name.toLowerCase().trim();
    const normalizedEmail = newRec.email.toLowerCase().trim();

    // Check if email already exists
    if (existingEmails.has(normalizedEmail)) {
      skippedUsers.push({
        name: newRec.name,
        email: newRec.email,
        reason: 'Email already exists in system'
      });
      continue;
    }

    // Check for duplicate name conflicts in NEW data
    const newMatches = nameToNewRecords.get(normalizedName);
    if (newMatches && newMatches.length > 1) {
      // Check if all duplicates have unique Employee IDs
      const employeeIds = newMatches.map(r => r.employeeId).filter(e => e && e.trim() !== '');
      const uniqueEmployeeIds = new Set(employeeIds);
      
      if (employeeIds.length === newMatches.length && uniqueEmployeeIds.size === newMatches.length) {
        // All have unique Employee IDs - can process
        // Just add a note about the disambiguation
        usersToCreate.push({
          FullName: newRec.name,
          Email: normalizedEmail,
          Role: DEFAULT_ROLE,
          ManagerEmail: newRec.managerEmail,
          TeamID: ECOM_TEAM_ID,
          TeamName: ECOM_TEAM_NAME,
          Password: DEFAULT_PASSWORD
        });
      } else {
        // True conflict - cannot disambiguate
        const emails = newMatches.map(r => r.email).filter(e => e);
        if (!duplicateConflicts.find(c => c.name.toLowerCase() === normalizedName)) {
          duplicateConflicts.push({ name: newRec.name, emails });
        }
        skippedUsers.push({
          name: newRec.name,
          email: newRec.email,
          reason: 'Duplicate name conflict without unique Employee IDs'
        });
      }
    } else {
      // No duplicate name - process normally
      usersToCreate.push({
        FullName: newRec.name,
        Email: normalizedEmail,
        Role: DEFAULT_ROLE,
        ManagerEmail: newRec.managerEmail,
        TeamID: ECOM_TEAM_ID,
        TeamName: ECOM_TEAM_NAME,
        Password: DEFAULT_PASSWORD
      });
    }
  }

  console.log('\n=== PROCESSING RESULTS ===');
  console.log(`Total records processed: ${newRecords.length}`);
  console.log(`Users to create: ${usersToCreate.length}`);
  console.log(`Skipped (already exists): ${skippedUsers.filter(s => s.reason === 'Email already exists in system').length}`);
  console.log(`Skipped (conflicts): ${skippedUsers.filter(s => s.reason === 'Duplicate name conflict without unique Employee IDs').length}`);
  console.log(`Duplicate conflicts: ${duplicateConflicts.length}`);

  if (duplicateConflicts.length > 0) {
    console.log('\n=== DUPLICATE CONFLICTS ===');
    for (const conflict of duplicateConflicts) {
      console.log(`- ${conflict.name}: ${conflict.emails.join(', ')}`);
    }
  }

  if (skippedUsers.length > 0) {
    console.log('\n=== SKIPPED USERS ===');
    for (const skipped of skippedUsers) {
      console.log(`- ${skipped.name} (${skipped.email}): ${skipped.reason}`);
    }
  }

  console.log('\n=== USERS TO BE CREATED ===');
  console.log('Name, Email, Manager Email, Role, TeamID, TeamName, Password');
  for (const user of usersToCreate) {
    console.log(`${user.FullName}, ${user.Email}, ${user.ManagerEmail}, ${user.Role}, ${user.TeamID}, ${user.TeamName}, ${user.Password}`);
  }

  if (dryRun) {
    console.log('\n=== DRY RUN COMPLETE - NO CHANGES MADE ===');
    console.log('Run with --execute flag to actually create user accounts');
    process.exit(0);
  }

  // --- EXECUTION PHASE ---
  console.log('\n=== EXECUTION MODE - CREATING USER ACCOUNTS ===');

  const db = getDb();
  const now = new Date().toISOString();
  const rowsToAppend: any[][] = [];
  const creationErrors: { email: string; error: string }[] = [];

  for (const user of usersToCreate) {
    try {
      // Generate user ID
      const newUserId = generateUserId();

      // Hash password
      const hashedPassword = await bcrypt.hash(user.Password, parseInt(process.env.BCRYPT_ROUNDS || '12'));

      // Create user row (same schema as bulk upload)
      const userRow = [
        newUserId,                    // UserID (A)
        user.FullName,                // FullName (B)
        user.Email,                   // Email (C)
        user.Role,                    // Role (D)
        user.ManagerEmail,            // ManagerEmail (E)
        user.TeamID,                  // TeamID (F)
        user.TeamName,                // TeamName (G)
        'true',                       // Active (H) - auto-activate
        'true',                       // CanCreateFollowUp (I)
        'true',                       // CanCloseTask (J)
        now,                          // CreatedAt (K)
        now,                          // UpdatedAt (L)
        hashedPassword,               // Password (M) - bcrypt hash
        'approved',                   // ApprovalStatus (N) - auto-approved
        'system',                     // RequestedBy (O)
        now,                          // RequestedAt (P)
        'system',                     // ApprovedBy (Q)
        now                           // ApprovedAt (R)
      ];

      rowsToAppend.push(userRow);
    } catch (error) {
      creationErrors.push({
        email: user.Email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Append all valid users to Google Sheets
  if (rowsToAppend.length > 0) {
    console.log(`Writing ${rowsToAppend.length} users to Google Sheets...`);
    const success = await appendSheetValues(tokenData.accessToken, spreadsheetId, 'users', rowsToAppend);

    if (!success) {
      console.error('Failed to append users to Google Sheets');
      process.exit(1);
    }

    console.log(`Successfully appended ${rowsToAppend.length} users to Google Sheets`);

    // Also write to Firestore for Admin Panel visibility
    console.log('Writing users to Firestore...');
    for (let i = 0; i < rowsToAppend.length; i++) {
      const row = rowsToAppend[i];
      try {
        await db.collection(USERS_COLLECTION).doc(row[2]).set({
          UserID: row[0],
          FullName: row[1],
          Email: row[2],
          Role: row[3],
          ManagerEmail: row[4],
          TeamID: row[5],
          TeamName: row[6],
          Active: row[7] === 'true',
          CanCreateFollowUp: row[8] === 'true',
          CanCloseTask: row[9] === 'true',
          CreatedAt: row[10],
          UpdatedAt: row[11],
          Password: row[12],
          ApprovalStatus: row[13],
          RequestedBy: row[14],
          RequestedAt: row[15],
          ApprovedBy: row[16],
          ApprovedAt: row[17],
          TeamIDs: row[5] ? [row[5]] : [],
          TeamNames: row[6] ? [row[6]] : [],
        });
      } catch (firestoreErr) {
        console.error(`Failed to write user ${row[2]} to Firestore:`, firestoreErr);
        // Non-fatal: Sheets is the source of truth
      }
    }
    console.log(`Successfully wrote ${rowsToAppend.length} users to Firestore`);
  }

  if (creationErrors.length > 0) {
    console.log('\n=== CREATION ERRORS ===');
    for (const error of creationErrors) {
      console.log(`- ${error.email}: ${error.error}`);
    }
  }

  console.log('\n=== EXECUTION SUMMARY ===');
  console.log(`Users created: ${rowsToAppend.length}`);
  console.log(`Creation errors: ${creationErrors.length}`);
  console.log(`Skipped (already exists): ${skippedUsers.filter(s => s.reason === 'Email already exists in system').length}`);
  console.log(`Skipped (conflicts): ${skippedUsers.filter(s => s.reason === 'Duplicate name conflict without unique Employee IDs').length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
