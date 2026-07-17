/**
 * Standalone dry-run for taskDueDateScheduler.
 *
 * Runs the full check (reads real Firestore lock state, real Sheets tasks/users)
 * with ZERO side effects: no lock claimed, no settings written, no emails sent.
 *
 * Usage (from project root, same place you'd run other server\*.ts scripts):
 *   $env:TASK_SCHEDULER_DRY_RUN="true"; npx ts-node server\dry-run-task-reminders.ts
 *
 * Or if you use tsx:
 *   $env:TASK_SCHEDULER_DRY_RUN="true"; npx tsx server\dry-run-task-reminders.ts
 *
 * Watch the logs for:
 *   - "[lock state]" line: shows what the real run would decide (SKIP vs PROCEED)
 *     based on today's actual last_due_date_check_* values in Firestore.
 *   - "[DRY RUN] Would send OVERDUE/DUE-SOON email for task ..." lines: exactly
 *     which tasks and recipients would receive an email in a real run.
 *   - Final "[DRY RUN] Not writing final status" confirms nothing was mutated.
 *
 * Requires the same environment/credentials the server normally runs with
 * (Google Sheets auth, FIREBASE_PROJECT_ID / ADC for Firestore), since it's
 * reading real production data - it just refuses to write anything.
 */
process.env.TASK_SCHEDULER_DRY_RUN = 'true';

import { checkAndSendDueDateReminders } from './services/taskDueDateScheduler';

checkAndSendDueDateReminders()
  .then(() => {
    console.log('\nDry run complete. Nothing was sent, nothing was written.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Dry run failed:', err);
    process.exit(1);
  });