import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';

async function migrateReminderThreads() {
  try {
    console.log('=== Migrating Report Reminder Threads to Persistent Model ===\n');

    // Fetch all existing thread documents
    const snapshot = await firestoreAdmin.collection('report_reminder_threads').get();
    
    console.log(`Found ${snapshot.size} existing thread documents\n`);

    // Group by teamId + recipientEmail to find duplicates
    const threadGroups: Map<string, any[]> = new Map();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const key = `${data.teamId}_${data.recipientEmail}`;
      
      if (!threadGroups.has(key)) {
        threadGroups.set(key, []);
      }
      threadGroups.get(key)!.push({
        docId: doc.id,
        ...data
      });
    });

    console.log(`Found ${threadGroups.size} unique team+recipient combinations\n`);

    // Process each group
    let migratedCount = 0;
    let skippedCount = 0;

    for (const [key, threads] of threadGroups) {
      if (threads.length === 1) {
        // Single thread - just rename the document
        const thread = threads[0];
        const oldDocId = thread.docId;
        const newDocId = key;
        
        if (oldDocId !== newDocId) {
          console.log(`Migrating single thread: ${key}`);
          
          // Create new document with persistent key
          await firestoreAdmin.collection('report_reminder_threads').doc(newDocId).set({
            teamId: thread.teamId,
            teamName: thread.teamName,
            recipientEmail: thread.recipientEmail,
            lastWeekOf: thread.weekOf || thread.lastWeekOf,
            gmailThreadId: thread.gmailThreadId,
            gmailMessageId: thread.gmailMessageId,
            lastSentAt: thread.sentAt || thread.lastSentAt || new Date().toISOString(),
            createdAt: thread.createdAt || thread.sentAt || new Date().toISOString(),
          });
          
          // Delete old document
          await firestoreAdmin.collection('report_reminder_threads').doc(oldDocId).delete();
          
          migratedCount++;
        } else {
          skippedCount++;
        }
      } else {
        // Multiple threads - keep the most recent one
        console.log(`Consolidating ${threads.length} threads for: ${key}`);
        
        // Sort by sentAt/lastSentAt descending
        threads.sort((a, b) => {
          const timeA = new Date(a.sentAt || a.lastSentAt || 0).getTime();
          const timeB = new Date(b.sentAt || b.lastSentAt || 0).getTime();
          return timeB - timeA;
        });
        
        const mostRecent = threads[0];
        const newDocId = key;
        
        // Create new document with persistent key using most recent thread
        await firestoreAdmin.collection('report_reminder_threads').doc(newDocId).set({
          teamId: mostRecent.teamId,
          teamName: mostRecent.teamName,
          recipientEmail: mostRecent.recipientEmail,
          lastWeekOf: mostRecent.weekOf || mostRecent.lastWeekOf,
          gmailThreadId: mostRecent.gmailThreadId,
          gmailMessageId: mostRecent.gmailMessageId,
          lastSentAt: mostRecent.sentAt || mostRecent.lastSentAt || new Date().toISOString(),
          createdAt: mostRecent.createdAt || mostRecent.sentAt || new Date().toISOString(),
        });
        
        // Delete all old documents
        for (const thread of threads) {
          await firestoreAdmin.collection('report_reminder_threads').doc(thread.docId).delete();
        }
        
        migratedCount++;
      }
    }

    console.log('\n=== Migration Complete ===');
    console.log(`Migrated: ${migratedCount}`);
    console.log(`Skipped: ${skippedCount}`);

  } catch (error) {
    console.error('Error migrating reminder threads:', error);
    process.exit(1);
  }
}

migrateReminderThreads()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
