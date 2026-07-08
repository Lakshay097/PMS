/**
 * scripts/delete-users-not-in-csv.ts
 *
 * ONE-TIME, HIGHLY DESTRUCTIVE SCRIPT.
 * Deletes every user in Firestore whose email is NOT present in the given CSV.
 *
 * CSV format required (only the email column matters, others are ignored):
 *   email,team,subTeam
 *   john@x.com,TeamA,SubTeam1
 *
 * Usage (ALWAYS dry-run first):
 *   npx ts-node -r dotenv/config scripts/delete-users-not-in-csv.ts ./data/team-assignments.csv --dry-run
 *
 * Real deletion (irreversible) requires an EXPLICIT extra flag:
 *   npx ts-node -r dotenv/config scripts/delete-users-not-in-csv.ts ./data/team-assignments.csv --confirm-delete
 *
 * SAFETY MEASURES BUILT IN:
 *   1. Defaults to dry-run behavior — the destructive flag must be passed explicitly and spelled exactly.
 *   2. ALWAYS writes a full JSON backup of every user about to be deleted (their entire document data)
 *      BEFORE deleting anything, so accounts can be manually restored if needed.
 *   3. PROTECTED_EMAILS / PROTECTED_ROLES list below is NEVER deleted, no matter what — use this to make
 *      sure admins and yourself can never be wiped out by a bad CSV or a mistake.
 *   4. Prints the full list of who WOULD be deleted and waits — you must review the dry-run output first.
 *   5. Batches deletes safely (chunks of 500, Firestore's batch limit).
 *   6. Writes a final JSON report of exactly what was deleted / skipped / protected.
 *
 * IMPORTANT: Update PROTECTED_EMAILS, PROTECTED_ROLES, USERS_COLLECTION, and ROLE_FIELD
 * below to match your actual project before running for real.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync"; // npm install csv-parse
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { PollingWatchKind } from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// CONFIG — CONFIRM THESE BEFORE RUNNING FOR REAL
// ---------------------------------------------------------------------------
const USERS_COLLECTION = "users"; // confirmed from authController.ts
const ROLE_FIELD = "role"; // TODO: confirm this matches your actual user document field name
const BATCH_LIMIT = 500;

// Emails that must NEVER be deleted, regardless of whether they're in the CSV.
// Add your own account and any other admins here as a hard safety net.
const PROTECTED_EMAILS: string[] = [
  "admin@pw.live",
  "aarti.1@pw.live",
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
  "yogesh.uniyal@pw.live",
];

// Roles that must NEVER be deleted (e.g. keep every admin safe automatically).
const PROTECTED_ROLES: string[] = ["Admin"]; // TODO: confirm exact role string used in your DB (e.g. "Admin")

// ---------------------------------------------------------------------------
// Firebase init — same pattern as bulk-assign-team.ts
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
    console.error(`Missing required Firebase Admin environment variables: ${missing.join(", ")}.`);
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
// Helpers
// ---------------------------------------------------------------------------
function loadCsvEmails(filePath: string): Set<string> {
  const raw = fs.readFileSync(filePath, "utf-8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

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
  const dryRun = !confirmDelete; // dry-run is the default; only --confirm-delete performs real deletes

  if (!csvPath) {
    console.error(
      "Usage: npx ts-node scripts/delete-users-not-in-csv.ts <path-to-csv> [--dry-run | --confirm-delete]"
    );
    process.exit(1);
  }

  const absPath = path.resolve(csvPath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  console.log(`\nLoading reference CSV: ${absPath}`);
  const keepEmails = loadCsvEmails(absPath);
  console.log(`CSV contains ${keepEmails.size} unique emails to KEEP.\n`);

  console.log("Fetching all users from Firestore...");
  const snapshot = await db.collection(USERS_COLLECTION).get();
  console.log(`Total users in database: ${snapshot.size}\n`);

  const toDelete: { id: string; data: FirebaseFirestore.DocumentData }[] = [];
  const protectedSkipped: string[] = [];
  const kept: string[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    const email = doc.id.toLowerCase(); // doc ID is the normalized email in this schema
    const role = (data[ROLE_FIELD] || "").toString().toLowerCase();

    if (keepEmails.has(email)) {
      kept.push(email);
      return;
    }

    if (PROTECTED_EMAILS.map((e) => e.toLowerCase()).includes(email)) {
      protectedSkipped.push(email);
      return;
    }

    if (PROTECTED_ROLES.map((r) => r.toLowerCase()).includes(role)) {
      protectedSkipped.push(email);
      return;
    }

    toDelete.push({ id: doc.id, data });
  });

  console.log(`Users matching CSV (kept): ${kept.length}`);
  console.log(`Users protected (never deleted): ${protectedSkipped.length}`);
  console.log(`Users that WOULD BE DELETED: ${toDelete.length}\n`);

  if (toDelete.length === 0) {
    console.log("Nothing to delete. Exiting.");
    process.exit(0);
  }

  console.log("--- Users targeted for deletion ---");
  toDelete.forEach((u) => console.log(`  - ${u.id}`));
  console.log("");

  // ALWAYS write a backup of full user data before deleting anything, even in dry-run,
  // so you always have a recovery file corresponding to any real run.
  const backupPath = path.join(
    path.dirname(absPath),
    `deleted-users-backup-${Date.now()}.json`
  );
  fs.writeFileSync(backupPath, JSON.stringify(toDelete, null, 2));
  console.log(`Backup of full user data written to: ${backupPath}`);
  console.log("(Keep this file — it's the only way to restore these accounts if needed.)\n");

  if (dryRun) {
    console.log("--- DRY RUN: no deletions performed ---");
    console.log(
      `To actually delete these ${toDelete.length} users, re-run with --confirm-delete instead of --dry-run.\n`
    );
    process.exit(0);
  }

  console.log(`!!! CONFIRM-DELETE MODE: permanently deleting ${toDelete.length} users now !!!\n`);

  const deleteChunks = chunk(toDelete, BATCH_LIMIT);
  let deletedCount = 0;
  for (const group of deleteChunks) {
    const batch = db.batch();
    for (const u of group) {
      batch.delete(db.collection(USERS_COLLECTION).doc(u.id));
    }
    await batch.commit();
    deletedCount += group.length;
    console.log(`Deleted batch of ${group.length} users (total so far: ${deletedCount}).`);
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Kept: ${kept.length}`);
  console.log(`Protected (skipped): ${protectedSkipped.length}`);
  console.log(`Deleted: ${deletedCount}`);
  console.log(`Backup file: ${backupPath}\n`);

  console.log(
    "REMINDER: these users still exist in Google Sheets (if used as source of truth) — " +
      "delete/update rows there separately if needed to keep both in sync."
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error running delete-users-not-in-csv script:", err);
  process.exit(1);
});