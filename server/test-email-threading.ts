import { sendEmailAsUser } from './services/emailService';
import { firestoreAdmin } from './services/firebaseAdmin';
import { config } from './config/env';
import { logger } from './utils/logger';

async function testEmailThreading() {
  const senderEmail = config.SYSTEM_SENDER_EMAIL;
  const testRecipient = 'lakshay.kumar@pw.live';
  const testTeamId = 'TEST_TEAM_' + Date.now();
  const testTeamName = 'Test Team for Threading Verification';
  
  // Calculate week of
  const getWeekOfDate = (date: Date): string => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0];
  };
  const weekOf = getWeekOfDate(new Date());

  console.log('=== Email Threading Test ===');
  console.log(`Sender: ${senderEmail}`);
  console.log(`Recipient: ${testRecipient}`);
  console.log(`Week of: ${weekOf}`);
  console.log(`Test Team ID: ${testTeamId}`);
  console.log('');

  // Step 1: Send Thursday reminder (simulated)
  console.log('Step 1: Sending Thursday reminder...');
  const reminderResult = await sendEmailAsUser(
    senderEmail,
    testRecipient,
    '', // empty subject to trigger template
    '', // empty body to trigger template
    'template_scheduled_reminder',
    {
      TeamName: testTeamName,
      AppURL: config.APP_URL || 'http://localhost:3000'
    },
    undefined, // threadId
    undefined, // messageId
    undefined, // taskId
    testTeamId,
    null, // subTeamId
    'thursday_reminder',
    weekOf
  );

  console.log(`Reminder result:`, {
    success: reminderResult.success,
    usedFallback: reminderResult.usedFallback,
    gmailThreadId: reminderResult.gmailThreadId,
    gmailMessageId: reminderResult.gmailMessageId
  });

  if (!reminderResult.success) {
    console.error('❌ FAILED: Reminder email did not send successfully');
    process.exit(1);
  }

  if (reminderResult.usedFallback) {
    console.error('❌ FAILED: Reminder email used fallback (OAuth token not working)');
    process.exit(1);
  }

  if (!reminderResult.gmailThreadId || !reminderResult.gmailMessageId) {
    console.error('❌ FAILED: No threadId/messageId returned from Gmail');
    process.exit(1);
  }

  console.log('✅ Reminder sent successfully');
  console.log(`   Thread ID: ${reminderResult.gmailThreadId}`);
  console.log(`   Message ID: ${reminderResult.gmailMessageId}`);
  console.log('');

  // Store thread info in Firebase for threading
  const docId = `${testTeamId}_${weekOf}`;
  try {
    await firestoreAdmin.collection('teamReminderThreads').doc(docId).set({
      teamId: testTeamId,
      weekOf,
      gmailThreadId: reminderResult.gmailThreadId,
      gmailMessageId: reminderResult.gmailMessageId,
      sentAt: new Date().toISOString(),
      sentTo: testRecipient,
      teamName: testTeamName,
      subTeamId: null
    });
    console.log(`✅ Stored thread info in Firebase (${docId})`);
  } catch (err) {
    console.error('❌ FAILED: Could not store thread info in Firebase:', err);
    process.exit(1);
  }
  console.log('');

  // Wait a moment before sending proof email
  console.log('Waiting 2 seconds before sending proof email...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('');

  // Step 2: Send proof email (threaded)
  console.log('Step 2: Sending proof email (threaded)...');
  let proofEmailBody = `Weekly report proof of submission for ${testTeamName}\n\n`;
  proofEmailBody += `Submitted by: Test User\n`;
  proofEmailBody += `Submitted at: ${new Date().toLocaleString()}\n\n`;
  proofEmailBody += `Note: This is a test email for threading verification.\n`;
  proofEmailBody += `Attachments: https://example.com/test.pdf\n`;

  const proofResult = await sendEmailAsUser(
    senderEmail,
    testRecipient,
    `Weekly Report Proof: ${testTeamName}`,
    proofEmailBody,
    undefined, // no template
    undefined,
    reminderResult.gmailThreadId, // threadId from reminder
    reminderResult.gmailMessageId, // messageId from reminder
    undefined, // taskId
    testTeamId,
    undefined, // subTeamId
    'proof_email',
    weekOf
  );

  console.log(`Proof email result:`, {
    success: proofResult.success,
    usedFallback: proofResult.usedFallback,
    gmailThreadId: proofResult.gmailThreadId,
    gmailMessageId: proofResult.gmailMessageId
  });

  if (!proofResult.success) {
    console.error('❌ FAILED: Proof email did not send successfully');
    process.exit(1);
  }

  if (proofResult.usedFallback) {
    console.error('❌ FAILED: Proof email used fallback (OAuth token not working)');
    process.exit(1);
  }

  if (!proofResult.gmailThreadId || !proofResult.gmailMessageId) {
    console.error('❌ FAILED: No threadId/messageId returned from Gmail');
    process.exit(1);
  }

  console.log('✅ Proof email sent successfully');
  console.log(`   Thread ID: ${proofResult.gmailThreadId}`);
  console.log(`   Message ID: ${proofResult.gmailMessageId}`);
  console.log('');

  // Verify threading
  if (proofResult.gmailThreadId === reminderResult.gmailThreadId) {
    console.log('✅ THREADING VERIFIED: Proof email has same thread ID as reminder');
  } else {
    console.error('❌ THREADING FAILED: Proof email has different thread ID');
    console.error(`   Reminder thread ID: ${reminderResult.gmailThreadId}`);
    console.error(`   Proof thread ID: ${proofResult.gmailThreadId}`);
    process.exit(1);
  }

  console.log('');
  console.log('=== TEST SUMMARY ===');
  console.log('✅ All checks passed');
  console.log('');
  console.log('Please verify in the inbox at lakshay.kumar@pw.live:');
  console.log('1. Both emails arrived');
  console.log('2. The proof email appears as a reply in the same thread as the reminder');
  console.log('3. No CC recipients were included');
  console.log('');
  console.log('Thread IDs for reference:');
  console.log(`  Reminder: ${reminderResult.gmailThreadId}`);
  console.log(`  Proof: ${proofResult.gmailThreadId}`);
  console.log(`  Reminder Message ID: ${reminderResult.gmailMessageId}`);
  console.log(`  Proof Message ID: ${proofResult.gmailMessageId}`);
}

// Run the test
testEmailThreading().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
