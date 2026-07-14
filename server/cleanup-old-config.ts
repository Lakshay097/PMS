import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';

async function cleanupOldConfig() {
  try {
    console.log('=== Cleaning up old team report configurations ===\n');

    // Old sub-team IDs under E-Com that should be removed
    const oldSubTeamIds = [
      'ST-T-6-1783488201671', // Ecom Printing
      'ST-T-6-1783488209444', // Ecom SST
      'ST-T-6-1783758558930', // Ecom ERP and tools
      'ST-T-6-1783758588245', // Ecom Planning
      'ST-T-6-1783759220250', // Ecom Purchase
      'ST-T-6-1783759232601', // Ecom DFT
      'ST-T-6-1783759294135', // Ecom Billing and Complaince
      'ST-T-6-1783759552747', // Ecom Warehouse
    ];

    console.log(`Deleting ${oldSubTeamIds.length} old sub-team configurations...\n`);

    let deletedCount = 0;
    let failedCount = 0;

    for (const teamId of oldSubTeamIds) {
      try {
        await firestoreAdmin.collection('team_report_config').doc(teamId).delete();
        console.log(`✅ Deleted: ${teamId}`);
        deletedCount++;
      } catch (error) {
        console.error(`❌ Failed to delete ${teamId}:`, error);
        failedCount++;
      }
    }

    console.log('\n=== Cleanup Complete ===');
    console.log(`Deleted: ${deletedCount}`);
    console.log(`Failed: ${failedCount}`);

    process.exit(0);
  } catch (error) {
    console.error('Error in cleanup:', error);
    process.exit(1);
  }
}

cleanupOldConfig();
