/**
 * scripts/bulk-assign-team.ts
 *
 * ONE-TIME SCRIPT: Bulk-assign existing users to a team/sub-team from a CSV file.
 *
 * CSV format required (headers must match exactly, subTeam optional):
 *   email,team,subTeam
 *   john@x.com,TeamA,SubTeam1
 *   jane@x.com,TeamA,
 *
 * Usage:
 *   npx ts-node scripts/bulk-assign-team.ts ./data/team-assignments.csv
 *   npx ts-node scripts/bulk-assign-team.ts ./data/team-assignments.csv --dry-run
 *
 * What it does:
 *   1. Parses and validates the CSV (required columns, no empty emails).
 *   2. Looks up each user by email in Firestore.
 *   3. Skips rows where the user doesn't exist, and reports them clearly.
 *   4. Batch-updates `team` and `subTeam` fields in Firestore (chunks of 500 - Firestore batch limit).
 *   5. Prints a full summary report at the end (updated / skipped / errors), and writes
 *      a JSON report file next to the CSV for your records.
 *
 * IMPORTANT:
 *   - Update the Firestore import path / collection name / field names below to match your project.
 *   - If you also keep Google Sheets as source of truth, wire up your existing sheets-sync
 *     function in the SYNC_TO_SHEETS section marked below.
 *   - Run with --dry-run first to see what WOULD happen without writing anything.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync"; // npm install csv-parse
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ESM doesn't have __dirname by default — reconstruct it
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// CONFIG — adjust to match your project
// ---------------------------------------------------------------------------
const USERS_COLLECTION = "users"; // Firestore collection name — confirmed from authController.ts
const TEAM_FIELD = "team"; // TODO: confirm this matches your actual user document field name
const SUBTEAM_FIELD = "subTeam"; // TODO: confirm this matches your actual user document field name
const BATCH_LIMIT = 500; // Firestore max writes per batch

// ---------------------------------------------------------------------------
// Firebase init — mirrors server/services/firebaseAdmin.ts exactly, inlined
// here (rather than imported) to avoid ESM relative-import/.js resolution
// issues when running standalone via ts-node.
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
    console.error(
      `Missing required Firebase Admin environment variables: ${missing.join(", ")}.\n` +
        "Make sure these are set in your .env file, and that dotenv is loaded, e.g.:\n" +
        "  npx ts-node -r dotenv/config scripts/bulk-assign-team.ts ./data/team-assignments.csv --dry-run\n"
    );
    process.exit(1);
  }

  const formattedPrivateKey = privateKey!.replace(/\\n/g, "\n");

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: projectId!,
        clientEmail: clientEmail!,
        privateKey: formattedPrivateKey,
      }),
    });
  }

  return getFirestore();
}

const db = getDb();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CsvRow {
  email: string;
  team: string;
  subTeam?: string;
}

interface RowResult {
  email: string;
  team: string;
  subTeam?: string;
  status: "updated" | "skipped" | "error";
  reason?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function loadCsv(filePath: string): CsvRow[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  return records.map((r) => ({
    email: (r.email || "").toLowerCase().trim(),
    team: (r.team || "").trim(),
    subTeam: (r.subTeam || "").trim() || undefined,
  }));
}

function validateRow(row: CsvRow): string | null {
  if (!row.email) return "Missing email";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return "Invalid email format";
  if (!row.team) return "Missing team";
  return null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Optional: sync updated users to Google Sheets (source of truth)
async function syncToSheets(updatedRows: RowResult[]): Promise<void> {
  // SYNC_TO_SHEETS:
  // Wire up your existing Sheets update function here, e.g.:
  //   await updateUsersInSheet(updatedRows.map(r => ({ email: r.email, team: r.team, subTeam: r.subTeam })));
  // Left as a no-op placeholder so the script doesn't fail if you haven't hooked it up yet.
  console.log(`(Skipping Sheets sync — wire up syncToSheets() if needed. ${updatedRows.length} rows to sync.)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");

  if (!csvPath) {
    console.error("Usage: npx ts-node scripts/bulk-assign-team.ts <path-to-csv> [--dry-run]");
    process.exit(1);
  }

  const absPath = path.resolve(csvPath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  console.log(`\nLoading CSV: ${absPath}`);
  const rows = loadCsv(absPath);
  console.log(`Found ${rows.length} rows.\n`);

  const results: RowResult[] = [];
  const validRows: CsvRow[] = [];

  // 1. Validate rows
  for (const row of rows) {
    const error = validateRow(row);
    if (error) {
      results.push({ ...row, status: "error", reason: error });
    } else {
      validRows.push(row);
    }
  }

  // 2. Look up each user directly by document ID (this project stores users
  //    with their normalized email AS the Firestore document ID, not as a
  //    queryable field — see authController.ts: collection('users').doc(normalizedEmail))
  const emailToUserId = new Map<string, string>();
  const notFound: string[] = [];

  await Promise.all(
    validRows.map(async (row) => {
      const docSnap = await db.collection(USERS_COLLECTION).doc(row.email).get();
      if (docSnap.exists) {
        emailToUserId.set(row.email, docSnap.id);
      } else {
        notFound.push(row.email);
      }
    })
  );

  // 3. Determine which rows are updatable vs. user-not-found
  const updatable: { row: CsvRow; userId: string }[] = [];
  for (const row of validRows) {
    const userId = emailToUserId.get(row.email);
    if (!userId) {
      results.push({ ...row, status: "error", reason: "User not found in database" });
    } else {
      updatable.push({ row, userId });
    }
  }

  console.log(`Valid rows: ${validRows.length}`);
  console.log(`Users matched: ${updatable.length}`);
  console.log(`Users not found: ${validRows.length - updatable.length}\n`);

  if (dryRun) {
    console.log("--- DRY RUN: no writes will be made ---\n");
    for (const { row } of updatable) {
      console.log(`Would update ${row.email} -> team=${row.team}, subTeam=${row.subTeam || "-"}`);
      results.push({ ...row, status: "updated", reason: "(dry-run, not actually written)" });
    }
  } else {
    // 4. Batch update Firestore (chunks of BATCH_LIMIT)
    const updateChunks = chunk(updatable, BATCH_LIMIT);
    for (const group of updateChunks) {
      const batch = db.batch();
      for (const { row, userId } of group) {
        const ref = db.collection(USERS_COLLECTION).doc(userId);
        const updateData: Record<string, any> = { [TEAM_FIELD]: row.team };
        if (row.subTeam) updateData[SUBTEAM_FIELD] = row.subTeam;
        batch.update(ref, updateData);
      }
      await batch.commit();
      console.log(`Committed batch of ${group.length} updates.`);
    }

    for (const { row } of updatable) {
      results.push({ ...row, status: "updated" });
    }

    // 5. Optional Sheets sync
    await syncToSheets(results.filter((r) => r.status === "updated"));
  }

  // 6. Summary + report file
  const updated = results.filter((r) => r.status === "updated").length;
  const errors = results.filter((r) => r.status === "error");

  console.log("\n=== SUMMARY ===");
  console.log(`Total rows processed: ${rows.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors/skipped: ${errors.length}`);
  if (errors.length) {
    console.log("\nFailed rows:");
    errors.forEach((e) => console.log(`  - ${e.email || "(no email)"}: ${e.reason}`));
  }

  const reportPath = path.join(
    path.dirname(absPath),
    `assignment-report-${Date.now()}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed report written to: ${reportPath}\n`);

  process.exit(errors.length > 0 && updated === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error running bulk-assign-team script:", err);
  process.exit(1);
});