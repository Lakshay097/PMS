import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin with explicit credentials for local execution
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing Firebase Admin credentials in .env file');
  process.exit(1);
}

const app = initializeApp({
  credential: cert({
    projectId,
    clientEmail,
    privateKey,
  }),
});

const firestoreAdmin = getFirestore(app);

// Teams that should have configs (from your data)
const CONFIGURED_TEAMS = new Set([
  'T-210', // Ecom - ERP & Tools
  'T-263', // Expansion
  'T-267', // SCM
  'T-293', // Warehouse
  'T-3',   // Expansion-School
  'T-476', // Ecom - Purchase
  'T-499', // Ecom - SST
  'T-5',   // Travel Desk
  'T-551', // Ecom - Planning
  'T-593', // Ecom - KAM
  'T-613', // Ecom - Billing
  'T-7',   // Business Excellence
  'T-706', // Infra Office/Corparate
  'T-739', // ATL/BTL Marketing
  'T-771', // Ecom - Printing
  // Expansion sub-teams
  'ST-T-263-1783758221249', // Akshay
  'ST-T-263-1783758227046', // Aman
  'ST-T-263-1783946827629', // MEP
]);

async function checkAndCleanConfigs() {
  try {
    console.log('=== Checking and Cleaning Team Report Configs ===\n');

    const snapshot = await firestoreAdmin.collection('team_report_config').get();
    console.log(`Found ${snapshot.size} configs in Firestore\n`);

    let toDelete = [];
    let toKeep = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const teamId = doc.id;
      const teamName = data.teamName || 'Unknown';
      const reminderDay = data.reminderDay;
      const meetingDay = data.meetingDay;

      if (CONFIGURED_TEAMS.has(teamId)) {
        toKeep.push({ teamId, teamName, reminderDay, meetingDay });
      } else {
        toDelete.push({ teamId, teamName, reminderDay, meetingDay });
      }
    });

    console.log('=== Configs to KEEP (correctly configured): ===');
    toKeep.forEach(config => {
      console.log(`${config.teamName} (${config.teamId}): ${config.reminderDay} → ${config.meetingDay}`);
    });

    console.log('\n=== Configs to DELETE (should be blank): ===');
    toDelete.forEach(config => {
      console.log(`${config.teamName} (${config.teamId}): ${config.reminderDay} → ${config.meetingDay} ❌`);
    });

    if (toDelete.length === 0) {
      console.log('\n✅ No incorrect configs found. All teams are correctly configured or blank.');
      return;
    }

    console.log(`\n⚠️  Found ${toDelete.length} incorrect configs that will be deleted.`);
    console.log('Proceeding with deletion...\n');

    let deletedCount = 0;
    for (const config of toDelete) {
      try {
        await firestoreAdmin.collection('team_report_config').doc(config.teamId).delete();
        deletedCount++;
        console.log(`🗑️  Deleted: ${config.teamName} (${config.teamId})`);
      } catch (error) {
        console.error(`❌ Error deleting ${config.teamName} (${config.teamId}):`, error);
      }
    }

    console.log(`\n✅ Cleanup complete. Deleted ${deletedCount} incorrect configs.`);
    console.log('Teams not in the schedule map are now blank and can be configured via Admin Panel.');

  } catch (error) {
    console.error('Error in checkAndCleanConfigs:', error);
    process.exit(1);
  }
}

checkAndCleanConfigs()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
