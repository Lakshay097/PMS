/**
 * scripts/delete-email-templates.ts
 *
 * Script to delete specific email templates from Firestore.
 * Deletes: template_task_creation, template_delayed_email, template_scheduled_reminder, template_scheduled_report_reminder
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from '../server/services/firebaseAdmin';

// Helper function to add delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to delete with retry
async function deleteWithRetry(templateId: string, maxRetries: number = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries}: Checking for template: ${templateId}`);
      
      const docRef = firestoreAdmin.collection('email_template').doc(templateId);
      const doc = await docRef.get();
      
      if (doc.exists) {
        await docRef.delete();
        console.log(`✓ Deleted: ${templateId}`);
        return true;
      } else {
        console.log(`- Not found (skipping): ${templateId}`);
        return true;
      }
    } catch (error: any) {
      if (error.code === 429 || error.status === 429) {
        const waitTime = Math.min(5000 * Math.pow(2, attempt - 1), 30000);
        console.log(`Rate limited. Waiting ${waitTime}ms before retry...`);
        await delay(waitTime);
      } else {
        console.error(`✗ Error deleting ${templateId}:`, error.message);
        return false;
      }
    }
  }
  console.error(`✗ Failed to delete ${templateId} after ${maxRetries} attempts`);
  return false;
}

async function deleteEmailTemplates() {
  console.log('=== Deleting Email Templates from Firestore ===\n');
  console.log('Waiting 30 seconds before starting to avoid rate limiting...\n');
  await delay(30000);

  const templatesToDelete = [
    'template_scheduled_reminder',
    'template_scheduled_report_reminder'
  ];

  for (const templateId of templatesToDelete) {
    await deleteWithRetry(templateId);
    // Add delay between different templates
    await delay(10000);
  }

  console.log('\n=== Deletion Complete ===');
}

deleteEmailTemplates()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
