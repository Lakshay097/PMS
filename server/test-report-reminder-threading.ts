import { sendEmailAsUser } from './services/emailService';
import { firestoreAdmin } from './services/firebaseAdmin';
import { config } from './config';
import { logger } from './utils/logger';

async function testReportReminderThreading() {
  const senderEmail = config.SYSTEM_SENDER_EMAIL;
  const testRecipient = 'lakshay.kumar@pw.live';
  const testTeamId = 'TEST_REPORT_TEAM_' + Date.now();
  const testTeamName = 'Test Report Team for Threading Verification';
  
  // Calculate week of
  const getWeekOfDate = (date: Date): string => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(3, '0')}`;
  };
  
  const weekOf = getWeekOfDate(new Date());
  
  console.log('=== Report Reminder Email Threading Test ===');
  console.log(`Sender: ${senderEmail}`);
  console.log(`Recipient: ${testRecipient}`);
  console.log(`Week of: ${weekOf}`);
  console.log(`Test Team ID: ${testTeamId}`);
  console.log('');

  // Step 1: Send onboarding email (first time)
  console.log('Step 1: Sending onboarding email (first time)...');
  const onboardingResult = await sendEmailAsUser(
    senderEmail,
    testRecipient,
    'Welcome to Weekly Reports - ' + testTeamName,
    '', // empty body to trigger template
    'template_report_onboarding',
    {
      TeamName: testTeamName,
      day: 'Friday',
      AppURL: config.APP_URL || 'http://localhost:3000',
      OfficialWorkMail: testRecipient,
      TemporaryPassword: '[Your assigned password]',
    },
    undefined, // threadId
    undefined, // messageId
    undefined, // taskId
    testTeamId,
    null, // subTeamId
    weekOf,
    'report_reminder'
  );

  if (!onboardingResult.success) {
    console.error('❌ Failed to send onboarding email');
    return;
  }
  console.log('✅ Onboarding email sent');
  console.log(`   Gmail Thread ID: ${onboardingResult.gmailThreadId}`);
  console.log(`   Gmail Message ID: ${onboardingResult.gmailMessageId}`);
  console.log('');

  // Store thread info in Firebase for threading
  const docId = `${testTeamId}_report_${weekOf}_${testRecipient}`;
  try {
    await firestoreAdmin.collection('report_reminder_threads').doc(docId).set({
      teamId: testTeamId,
      teamName: testTeamName,
      recipientEmail: testRecipient.toLowerCase(),
      weekOf,
      gmailThreadId: onboardingResult.gmailThreadId,
      gmailMessageId: onboardingResult.gmailMessageId,
      sentAt: new Date().toISOString(),
      isFirstTime: true,
    });
    console.log(`✅ Stored thread info in Firebase (${docId})`);
  } catch (err) {
    console.error('❌ Failed to store thread info:', err);
    return;
  }
  console.log('');

  // Wait a moment to ensure the first email is processed
  console.log('Waiting 3 seconds before sending reminder...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('');

  // Step 2: Send reminder email (subsequent, should thread)
  console.log('Step 2: Sending reminder email (should thread with previous)...');
  const reminderResult = await sendEmailAsUser(
    senderEmail,
    testRecipient,
    'Weekly Report Reminder - ' + testTeamName,
    '', // empty body to trigger template
    'template_report_reminder',
    {
      TeamName: testTeamName,
      day: 'Friday',
      AppURL: config.APP_URL || 'http://localhost:3000',
    },
    onboardingResult.gmailThreadId, // threadId from onboarding
    onboardingResult.gmailMessageId, // messageId from onboarding
    undefined, // taskId
    testTeamId,
    undefined, // subTeamId
    weekOf,
    'report_reminder'
  );

  if (!reminderResult.success) {
    console.error('❌ Failed to send reminder email');
    return;
  }
  console.log('✅ Reminder email sent');
  console.log(`   Gmail Thread ID: ${reminderResult.gmailThreadId}`);
  console.log(`   Gmail Message ID: ${reminderResult.gmailMessageId}`);
  console.log('');

  // Verify threading
  console.log('=== Threading Verification ===');
  if (reminderResult.gmailThreadId === onboardingResult.gmailThreadId) {
    console.log('✅ SUCCESS: Both emails have the same Thread ID');
    console.log('   This confirms they are in the same email thread');
  } else {
    console.log('❌ FAILURE: Thread IDs do not match');
    console.log(`   Onboarding Thread ID: ${onboardingResult.gmailThreadId}`);
    console.log(`   Reminder Thread ID: ${reminderResult.gmailThreadId}`);
  }
  console.log('');

  // Update Firebase with reminder thread info
  try {
    await firestoreAdmin.collection('report_reminder_threads').doc(docId).update({
      gmailThreadId: reminderResult.gmailThreadId,
      gmailMessageId: reminderResult.gmailMessageId,
      sentAt: new Date().toISOString(),
      isFirstTime: false,
    });
    console.log('✅ Updated thread info in Firebase');
  } catch (err) {
    console.error('❌ Failed to update thread info:', err);
  }
  console.log('');

  console.log('=== Test Complete ===');
  console.log('Please check your Gmail inbox to verify:');
  console.log('1. Both emails appear in the same conversation thread');
  console.log('2. The onboarding email contains login credentials');
  console.log('3. The reminder email does not contain credentials');
  console.log('4. Both emails reference the same team and meeting day');
}

// Run the test
testReportReminderThreading()
  .then(() => {
    console.log('\nTest execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nTest execution failed:', error);
    process.exit(1);
  });

