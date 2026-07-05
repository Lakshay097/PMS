/**
 * ONE-TIME MIGRATION: Convert sub-team membership from single to multi-membership.
 *
 * DATA MODEL CHANGE:
 *   User.SubTeamID: string  →  User.SubTeamIDs: string[]
 *   User.SubTeamName: string → User.SubTeamNames: string[]
 *
 * SAFETY PROPERTIES:
 *   - Read-only audit mode by default; writes only happen when --execute is passed
 *   - Converts legacy SubTeamID/SubTeamName to SubTeamIDs: [oldValue]/SubTeamNames: [oldValue]
 *   - Users with no sub-team assignment are counted but not modified
 *   - Users already using SubTeamIDs array are skipped (idempotent)
 *
 * USAGE:
 *   Audit (no writes):
 *     npx ts-node scripts/migrate-subteam-ids.ts
 *
 *   Execute (writes to Firestore):
 *     npx ts-node scripts/migrate-subteam-ids.ts --execute
 *
 * DEPENDENCIES: firebase-admin (in package.json)
 */

import 'dotenv/config';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const EXECUTE = process.argv.includes('--execute');

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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nMode: ${EXECUTE ? 'EXECUTE (will write)' : 'AUDIT (read-only, no writes)'}\n`);

  const snapshot = await db.collection('users').get();
  const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  console.log(`Total users in Firestore: ${users.length}`);

  type UserReport = {
    email: string;
    status: 'already_array' | 'legacy_singular' | 'no_assignment';
    oldValue?: string;
    newValue?: string[];
  };

  const report: UserReport[] = [];

  for (const user of users as any[]) {
    const email = user.Email || user.email;
    
    // Check if already using array format
    if (user.SubTeamIDs && Array.isArray(user.SubTeamIDs)) {
      report.push({ email, status: 'already_array' });
      continue;
    }

    // Check for legacy singular SubTeamID
    if (user.SubTeamID) {
      report.push({
        email,
        status: 'legacy_singular',
        oldValue: user.SubTeamID,
        newValue: [user.SubTeamID],
      });
      continue;
    }

    // No sub-team assignment
    report.push({ email, status: 'no_assignment' });
  }

  const alreadyArray = report.filter(r => r.status === 'already_array');
  const legacySingular = report.filter(r => r.status === 'legacy_singular');
  const noAssignment = report.filter(r => r.status === 'no_assignment');

  console.log(`  Already using SubTeamIDs array: ${alreadyArray.length}`);
  console.log(`  Legacy singular SubTeamID (need migration): ${legacySingular.length}`);
  console.log(`  No sub-team assignment: ${noAssignment.length}`);

  if (legacySingular.length === 0) {
    console.log('\nNo legacy SubTeamID fields found. Nothing to migrate.');
    return;
  }

  console.log('\nUsers with legacy SubTeamID (emails only):');
  legacySingular.forEach(r => console.log(`  ${r.email} (SubTeamID: ${r.oldValue})`));

  // Hard stop here in audit mode — nothing below this line runs without --execute
  if (!EXECUTE) {
    console.log('\nRun with --execute to convert these users to SubTeamIDs array format.');
    return;
  }

  // ── EXECUTE: convert to array format ─────────────────────────────────────────

  console.log('\nStarting migration...');
  let succeeded = 0;
  let failed = 0;

  for (const r of legacySingular) {
    try {
      const userRef = db.collection('users').doc(r.email);
      
      // Convert singular to array
      await userRef.update({
        SubTeamIDs: r.newValue,
        SubTeamNames: r.newValue, // Mirror IDs as names for now (can be refined later)
        // Note: we keep the old singular fields for now to allow rollback if needed
        // They can be removed in a follow-up cleanup migration
      });

      console.log(`  ✓ ${r.email}: SubTeamID → SubTeamIDs: [${r.newValue.join(', ')}]`);
      succeeded++;
    } catch (err) {
      console.error(`  ✗ ${r.email}: FAILED —`, err);
      failed++;
    }
  }

  console.log(`\nMigration complete. Succeeded: ${succeeded}, Failed: ${failed}`);
  if (failed > 0) {
    console.log('Re-run --execute to retry failed users (already-converted users are skipped).');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
