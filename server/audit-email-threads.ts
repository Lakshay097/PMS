import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { firestoreAdmin } from './services/firebaseAdmin';

async function auditEmailThreads() {
  try {
    console.log('=== Auditing Email Thread History ===\n');

    // Check report_reminder_threads collection
    const threadsSnapshot = await firestoreAdmin.collection('report_reminder_threads').get();
    
    console.log(`=== Current report_reminder_threads Collection ===`);
    console.log(`Total documents: ${threadsSnapshot.size}\n`);
    
    if (threadsSnapshot.empty) {
      console.log('No thread documents found');
    } else {
      threadsSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`Document ID: ${doc.id}`);
        console.log(`  Team ID: ${data.teamId}`);
        console.log(`  Team Name: ${data.teamName}`);
        console.log(`  Recipient: ${data.recipientEmail}`);
        console.log(`  Gmail Thread ID: ${data.gmailThreadId || 'N/A'}`);
        console.log(`  Gmail Message ID: ${data.gmailMessageId || 'N/A'}`);
        console.log(`  Last Week Of: ${data.lastWeekOf || data.weekOf || 'N/A'}`);
        console.log(`  Created At: ${data.createdAt || 'N/A'}`);
        console.log(`  Last Sent At: ${data.lastSentAt || data.sentAt || 'N/A'}`);
        console.log('');
      });
    }

    // Check task_email_threads collection (for task-related emails)
    console.log('\n=== Checking task_email_threads Collection ===');
    const taskThreadsSnapshot = await firestoreAdmin.collection('task_email_threads').get();
    console.log(`Total documents: ${taskThreadsSnapshot.size}\n`);
    
    if (!taskThreadsSnapshot.empty) {
      const uniquePairs = new Map<string, any[]>();
      
      taskThreadsSnapshot.forEach(doc => {
        const data = doc.data();
        const key = `${data.taskId}_${data.recipientEmail}`;
        
        if (!uniquePairs.has(key)) {
          uniquePairs.set(key, []);
        }
        uniquePairs.get(key)!.push({
          docId: doc.id,
          threadId: data.gmailThreadId,
          messageId: data.gmailMessageId,
          updatedAt: data.updatedAt
        });
      });
      
      console.log(`Unique task+recipient pairs: ${uniquePairs.size}\n`);
      
      for (const [key, threads] of uniquePairs) {
        console.log(`${key}: ${threads.length} thread(s)`);
        threads.forEach(t => {
          console.log(`  - Thread ID: ${t.threadId}, Message ID: ${t.messageId}`);
        });
      }
    }

    // Check email_logs for send history
    console.log('\n=== Checking email_logs Collection ===');
    const logsSnapshot = await firestoreAdmin.collection('email_logs')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();
    
    console.log(`Recent logs: ${logsSnapshot.size}\n`);
    
    const uniqueSenders = new Map<string, number>();
    const uniqueRecipients = new Map<string, number>();
    
    logsSnapshot.forEach(doc => {
      const data = doc.data();
      const sender = data.senderEmail || 'unknown';
      const recipient = data.recipientEmail || 'unknown';
      
      uniqueSenders.set(sender, (uniqueSenders.get(sender) || 0) + 1);
      uniqueRecipients.set(recipient, (uniqueRecipients.get(recipient) || 0) + 1);
    });
    
    console.log('Unique senders (recent 50 logs):');
    uniqueSenders.forEach((count, sender) => {
      console.log(`  ${sender}: ${count}`);
    });
    
    console.log('\nUnique recipients (recent 50 logs):');
    uniqueRecipients.forEach((count, recipient) => {
      console.log(`  ${recipient}: ${count}`);
    });

  } catch (error) {
    console.error('Error auditing email threads:', error);
    process.exit(1);
  }
}

auditEmailThreads()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
