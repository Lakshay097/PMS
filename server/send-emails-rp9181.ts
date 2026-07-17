import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { generateGoogleSheetsToken, fetchSheetValues } from './services/googleSheetsService';
import { sendEmailAsUser } from './services/emailService';
import { getEmailTemplate } from './services/emailTemplateStorage';
import { config } from './config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// Initialize Firebase Admin with explicit credentials
let _firestoreAdmin: Firestore | null = null;

function getFirestoreAdmin(): Firestore {
  if (_firestoreAdmin) {
    return _firestoreAdmin;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firebase Admin credentials in environment variables');
    throw new Error('Missing required Firebase Admin environment variables');
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  _firestoreAdmin = getFirestore();
  return _firestoreAdmin;
}

const firestoreAdmin = new Proxy({} as Firestore, {
  get(_target, prop) {
    const db = getFirestoreAdmin();
    const value = (db as any)[prop];
    return typeof value === 'function' ? value.bind(db) : value;
  },
});

async function sendEmails() {
  try {
    console.log('=== Sending Emails ===\n');

    // Get Google Sheets token
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      console.error('❌ Failed to get Google Sheets token');
      return;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const accessToken = tokenData.accessToken;

    // Fetch tasks and reports from Google Sheets
    const tasksRows = await fetchSheetValues(accessToken, spreadsheetId, 'tasks!A:Z');
    const reportsRows = await fetchSheetValues(accessToken, spreadsheetId, 'reports!A:Z');
    
    if (!tasksRows || !reportsRows) {
      console.log('❌ Failed to fetch data from Google Sheets');
      return;
    }

    const headerRow = tasksRows[0];
    const reportHeaderRow = reportsRows[0];

    // Find task TSK-4373 and report RP-9181
    const taskIdColIndex = headerRow.findIndex(col => col === 'TaskID');
    const reportIdColIndex = reportHeaderRow.findIndex(col => col === 'ReportID');
    
    let taskData = null;
    let reportData = null;

    for (let i = 1; i < tasksRows.length; i++) {
      if (tasksRows[i][taskIdColIndex] === 'TSK-4373') {
        taskData = tasksRows[i];
        break;
      }
    }

    for (let i = 1; i < reportsRows.length; i++) {
      if (reportsRows[i][reportIdColIndex] === 'RP-9181') {
        reportData = reportsRows[i];
        break;
      }
    }

    if (!taskData || !reportData) {
      console.log('❌ Task or report not found');
      return;
    }

    // Helper functions to get column values
    const getColValue = (colName: string, row: any[], headerRow: any[]) => {
      const colIndex = headerRow.findIndex(col => col === colName);
      return colIndex !== -1 ? row[colIndex] : 'N/A';
    };

    const getTaskColValue = (colName: string) => getColValue(colName, taskData, headerRow);
    const getReportColValue = (colName: string) => getColValue(colName, reportData, reportHeaderRow);

    // Send report email
    console.log('--- Sending Report Email ---');
    const reportRecipient = getTaskColValue('AssignedByEmail');
    const reportSender = getReportColValue('SubmittedByEmail');
    
    console.log(`From: ${reportSender}`);
    console.log(`To: ${reportRecipient}`);
    console.log(`Subject: Report Submitted for Task: ${getTaskColValue('Title')}`);
    
    // Try to get email template, otherwise use simple text
    const template = await getEmailTemplate('template_task_report');
    let subject, body;
    
    if (template) {
      subject = template.subject;
      body = template.body;
    } else {
      subject = `Report Submitted for Task: ${getTaskColValue('Title')}`;
      body = `A report has been submitted for your task.

Task: ${getTaskColValue('Title')}
Task ID: ${getTaskColValue('TaskID')}
Report ID: ${getReportColValue('ReportID')}
Submitted By: ${getReportColValue('SubmittedByEmail')}
Report Date: ${getReportColValue('ReportDate')}

Please review the report in the PMS system.`;
    }

    const templateVars = {
      TaskTitle: getTaskColValue('Title'),
      TaskID: getTaskColValue('TaskID'),
      ReportID: getReportColValue('ReportID'),
      SubmittedBy: getReportColValue('SubmittedByEmail'),
      ReportDate: getReportColValue('ReportDate'),
      AppURL: config.APP_URL,
    };

    const reportResult = await sendEmailAsUser(
      reportSender,
      reportRecipient,
      subject,
      body,
      'template_task_report',
      templateVars,
      undefined,
      undefined,
      getTaskColValue('TaskID'),
      getTaskColValue('TaskID'),
      undefined,
      undefined,
      'report_reminder',
      undefined,
      undefined,
      'report_reminder',
      false
    );

    if (reportResult.success) {
      console.log('✅ Report email sent successfully');
    } else {
      console.log('❌ Report email failed to send');
    }
    console.log('');

    // Get overdue and due today tasks
    const today = new Date().toISOString().split('T')[0];
    const statusColIndex = headerRow.findIndex(col => col === 'Status');
    const dueDateColIndex = headerRow.findIndex(col => col === 'DueDate');
    
    const overdueTasks = [];
    const dueTodayTasks = [];
    
    for (let i = 1; i < tasksRows.length; i++) {
      const row = tasksRows[i];
      const status = row[statusColIndex];
      const dueDate = row[dueDateColIndex];
      
      if (status !== 'Closed' && status !== 'Reviewed' && dueDate && dueDate < today) {
        overdueTasks.push(row);
      } else if (status !== 'Closed' && status !== 'Reviewed' && dueDate && dueDate === today) {
        dueTodayTasks.push(row);
      }
    }

    // Send overdue task emails
    console.log('--- Sending Overdue Task Emails ---');
    let overdueSent = 0;
    let overdueFailed = 0;

    for (const task of overdueTasks) {
      const getTaskColValue = (colName: string) => getColValue(colName, task, headerRow);
      
      const assignedToEmail = getTaskColValue('AssignedToEmail');
      const assignedByEmail = getTaskColValue('AssignedByEmail');
      
      const recipients = assignedToEmail && assignedToEmail !== 'N/A' 
        ? assignedToEmail.split(',').map(e => e.trim()).filter(Boolean)
        : [assignedByEmail];

      console.log(`Sending to: ${recipients.join(', ')}`);
      
      const subject = `OVERDUE: ${getTaskColValue('Title')}`;
      const body = `This task is overdue and requires immediate attention.

Task: ${getTaskColValue('Title')}
Task ID: ${getTaskColValue('TaskID')}
Due Date: ${getTaskColValue('DueDate')}
Status: ${getTaskColValue('Status')}

Please update the task status in the PMS system.`;

      // Send to each recipient
      for (const recipient of recipients) {
        const result = await sendEmailAsUser(
          assignedByEmail,
          recipient,
          subject,
          body,
          'template_overdue_task',
          { TaskTitle: getTaskColValue('Title'), TaskID: getTaskColValue('TaskID'), DueDate: getTaskColValue('DueDate'), AppURL: config.APP_URL },
          undefined,
          undefined,
          getTaskColValue('TaskID'),
          getTaskColValue('TaskID'),
          undefined,
          undefined,
          'report_reminder',
          undefined,
          undefined,
          'report_reminder',
          false
        );

        if (result.success) {
          overdueSent++;
          console.log(`  ✅ Sent to ${recipient}`);
        } else {
          overdueFailed++;
          console.log(`  ❌ Failed to send to ${recipient}`);
        }
      }
    }

    console.log(`Overdue emails: ${overdueSent} sent, ${overdueFailed} failed\n`);

    // Send due today task emails
    console.log('--- Sending Due Today Task Emails ---');
    let dueTodaySent = 0;
    let dueTodayFailed = 0;

    for (const task of dueTodayTasks) {
      const getTaskColValue = (colName: string) => getColValue(colName, task, headerRow);
      
      const assignedToEmail = getTaskColValue('AssignedToEmail');
      const assignedByEmail = getTaskColValue('AssignedByEmail');
      
      const recipients = assignedToEmail && assignedToEmail !== 'N/A' 
        ? assignedToEmail.split(',').map(e => e.trim()).filter(Boolean)
        : [assignedByEmail];

      console.log(`Sending to: ${recipients.join(', ')}`);
      
      const subject = `DUE TODAY: ${getTaskColValue('Title')}`;
      const body = `This task is due today.

Task: ${getTaskColValue('Title')}
Task ID: ${getTaskColValue('TaskID')}
Due Date: ${getTaskColValue('DueDate')}
Status: ${getTaskColValue('Status')}

Please complete the task by end of day.`;

      // Send to each recipient
      for (const recipient of recipients) {
        const result = await sendEmailAsUser(
          assignedByEmail,
          recipient,
          subject,
          body,
          'template_due_today_task',
          { TaskTitle: getTaskColValue('Title'), TaskID: getTaskColValue('TaskID'), DueDate: getTaskColValue('DueDate'), AppURL: config.APP_URL },
          undefined,
          undefined,
          getTaskColValue('TaskID'),
          getTaskColValue('TaskID'),
          undefined,
          undefined,
          'report_reminder',
          undefined,
          undefined,
          'report_reminder',
          false
        );

        if (result.success) {
          dueTodaySent++;
          console.log(`  ✅ Sent to ${recipient}`);
        } else {
          dueTodayFailed++;
          console.log(`  ❌ Failed to send to ${recipient}`);
        }
      }
    }

    console.log(`Due today emails: ${dueTodaySent} sent, ${dueTodayFailed} failed\n`);

    console.log('=== Email Sending Complete ===');
    console.log(`Total: ${1 + overdueSent + dueTodaySent} emails sent successfully`);
    console.log(`Failed: ${overdueFailed + dueTodayFailed} emails failed`);

  } catch (error) {
    console.error('Error sending emails:', error);
    process.exit(1);
  }
}

sendEmails()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
