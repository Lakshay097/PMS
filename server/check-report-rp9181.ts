import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { generateGoogleSheetsToken, fetchSheetValues } from './services/googleSheetsService';

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

async function checkReportRP9181() {
  try {
    console.log('=== Checking Report RP-9181 ===\n');

    // Since Firestore Tasks collection is empty, data must be in Google Sheets
    console.log('Searching in Google Sheets for task TSK-4373...\n');

    // Get Google Sheets token
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      console.error('❌ Failed to get Google Sheets token');
      return;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const accessToken = tokenData.accessToken;

    // Search for task TSK-4373 in the tasks sheet
    console.log('Fetching tasks from Google Sheets...');
    const tasksRows = await fetchSheetValues(accessToken, spreadsheetId, 'tasks!A:Z');
    
    if (!tasksRows || tasksRows.length === 0) {
      console.log('❌ No tasks found in Google Sheets');
      return;
    }

    console.log(`Found ${tasksRows.length - 1} tasks in Google Sheets (excluding header)\n`);

    // Find task with ID TSK-4373
    let foundTask = null;
    let taskRowIndex = -1;
    
    // Assuming row 0 is header, find the column index for TaskID
    const headerRow = tasksRows[0];
    const taskIdColIndex = headerRow.findIndex(col => col === 'TaskID');
    
    if (taskIdColIndex === -1) {
      console.log('❌ TaskID column not found in tasks sheet');
      return;
    }

    for (let i = 1; i < tasksRows.length; i++) {
      const row = tasksRows[i];
      if (row[taskIdColIndex] === 'TSK-4373') {
        foundTask = row;
        taskRowIndex = i;
        break;
      }
    }

    if (!foundTask) {
      console.log('❌ Task TSK-4373 not found in Google Sheets');
      
      // Show some sample task IDs
      console.log('\nSample task IDs from Google Sheets:');
      for (let i = 1; i <= Math.min(10, tasksRows.length - 1); i++) {
        const row = tasksRows[i];
        const taskId = row[taskIdColIndex];
        const titleColIndex = headerRow.findIndex(col => col === 'Title');
        const title = titleColIndex !== -1 ? row[titleColIndex] : 'Unknown';
        console.log(`  - ${taskId}: ${title}`);
      }
      return;
    }

    console.log('✅ Found task TSK-4371 in Google Sheets');
    
    // Extract task details
    const getColValue = (colName: string) => {
      const colIndex = headerRow.findIndex(col => col === colName);
      return colIndex !== -1 ? foundTask[colIndex] : 'N/A';
    };

    console.log('--- Task Details ---');
    console.log(`TaskID: ${getColValue('TaskID')}`);
    console.log(`Title: ${getColValue('Title')}`);
    console.log(`Status: ${getColValue('Status')}`);
    console.log(`AssignedTo: ${getColValue('AssignedTo')}`);
    console.log(`AssignedToEmail: ${getColValue('AssignedToEmail')}`);
    console.log(`AssignedBy: ${getColValue('AssignedBy')}`);
    console.log(`AssignedByEmail: ${getColValue('AssignedByEmail')}`);
    console.log(`DueDate: ${getColValue('DueDate')}`);
    console.log(`Priority: ${getColValue('Priority')}`);
    console.log(`TeamID: ${getColValue('TeamID')}`);
    console.log('');

    // Now search for report RP-9181 in reports sheet
    console.log('Searching for report RP-9181 in Google Sheets...');
    const reportsRows = await fetchSheetValues(accessToken, spreadsheetId, 'reports!A:Z');
    
    if (!reportsRows || reportsRows.length === 0) {
      console.log('❌ No reports found in Google Sheets');
      return;
    }

    console.log(`Found ${reportsRows.length - 1} reports in Google Sheets (excluding header)\n`);

    // Find report with ID RP-9181
    const reportHeaderRow = reportsRows[0];
    const reportIdColIndex = reportHeaderRow.findIndex(col => col === 'ReportID');
    
    if (reportIdColIndex === -1) {
      console.log('❌ ReportID column not found in reports sheet');
      return;
    }

    let foundReport = null;
    for (let i = 1; i < reportsRows.length; i++) {
      const row = reportsRows[i];
      if (row[reportIdColIndex] === 'RP-9181') {
        foundReport = row;
        break;
      }
    }

    if (!foundReport) {
      console.log('❌ Report RP-9181 not found in Google Sheets');
      
      // Show some sample report IDs
      console.log('\nSample report IDs from Google Sheets:');
      for (let i = 1; i <= Math.min(10, reportsRows.length - 1); i++) {
        const row = reportsRows[i];
        const reportId = row[reportIdColIndex];
        console.log(`  - ${reportId}`);
      }
      return;
    }

    console.log('✅ Found report RP-9181 in Google Sheets');
    
    // Extract report details
    const getReportColValue = (colName: string) => {
      const colIndex = reportHeaderRow.findIndex(col => col === colName);
      return colIndex !== -1 ? foundReport[colIndex] : 'N/A';
    };

    console.log('--- Report Details ---');
    console.log(`ReportID: ${getReportColValue('ReportID')}`);
    console.log(`TaskID: ${getReportColValue('TaskID')}`);
    console.log(`ReportDate: ${getReportColValue('ReportDate')}`);
    console.log(`SubmittedBy: ${getReportColValue('SubmittedBy')}`);
    console.log(`SubmittedByEmail: ${getReportColValue('SubmittedByEmail')}`);
    console.log(`Status: ${getReportColValue('Status')}`);
    console.log(`Content: ${getReportColValue('Content')?.substring(0, 200)}...`);
    console.log(`AttachmentLinks: ${getReportColValue('AttachmentLinks') || 'None'}`);
    console.log('');

    // Check for overdue tasks and tasks due today in Google Sheets
    console.log('\n=== Checking Overdue and Due Today Tasks ===\n');
    const today = new Date().toISOString().split('T')[0];
    
    const statusColIndex = headerRow.findIndex(col => col === 'Status');
    const dueDateColIndex = headerRow.findIndex(col => col === 'DueDate');
    
    if (statusColIndex === -1 || dueDateColIndex === -1) {
      console.log('❌ Status or DueDate column not found in tasks sheet');
      return;
    }

    const overdueTasks = [];
    const dueTodayTasks = [];
    for (let i = 1; i < tasksRows.length; i++) {
      const row = tasksRows[i];
      const status = row[statusColIndex];
      const dueDate = row[dueDateColIndex];
      
      // Check if task is overdue (not Closed/Reviewed and due date is past)
      if (status !== 'Closed' && status !== 'Reviewed' && dueDate && dueDate < today) {
        overdueTasks.push(row);
      }
      // Check if task is due today (not Closed/Reviewed and due date is today)
      else if (status !== 'Closed' && status !== 'Reviewed' && dueDate && dueDate === today) {
        dueTodayTasks.push(row);
      }
    }

    console.log(`Found ${overdueTasks.length} overdue tasks\n`);

    for (const task of overdueTasks) {
      const getTaskColValue = (colName: string) => {
        const colIndex = headerRow.findIndex(col => col === colName);
        return colIndex !== -1 ? task[colIndex] : 'N/A';
      };
      
      console.log(`--- Overdue Task ${getTaskColValue('TaskID')} ---`);
      console.log(`Title: ${getTaskColValue('Title')}`);
      console.log(`AssignedToEmail: ${getTaskColValue('AssignedToEmail')}`);
      console.log(`AssignedByEmail: ${getTaskColValue('AssignedByEmail')}`);
      console.log(`DueDate: ${getTaskColValue('DueDate')} (OVERDUE)`);
      console.log(`Status: ${getTaskColValue('Status')}`);
      console.log(`Priority: ${getTaskColValue('Priority')}`);
      console.log(`TeamID: ${getTaskColValue('TeamID')}`);
      console.log('');
    }

    console.log(`Found ${dueTodayTasks.length} tasks due today\n`);

    for (const task of dueTodayTasks) {
      const getTaskColValue = (colName: string) => {
        const colIndex = headerRow.findIndex(col => col === colName);
        return colIndex !== -1 ? task[colIndex] : 'N/A';
      };
      
      console.log(`--- Due Today Task ${getTaskColValue('TaskID')} ---`);
      console.log(`Title: ${getTaskColValue('Title')}`);
      console.log(`AssignedToEmail: ${getTaskColValue('AssignedToEmail')}`);
      console.log(`AssignedByEmail: ${getTaskColValue('AssignedByEmail')}`);
      console.log(`DueDate: ${getTaskColValue('DueDate')} (DUE TODAY)`);
      console.log(`Status: ${getTaskColValue('Status')}`);
      console.log(`Priority: ${getTaskColValue('Priority')}`);
      console.log(`TeamID: ${getTaskColValue('TeamID')}`);
      console.log('');
    }

    // Get team information and stakeholders
    console.log('\n=== Getting Team and Stakeholder Information ===\n');
    
    // Fetch settings to get stakeholder emails
    const settingsRows = await fetchSheetValues(accessToken, spreadsheetId, 'settings!A:B');
    
    if (!settingsRows) {
      console.log('❌ Failed to fetch settings sheet');
      return;
    }

    // Helper function to get setting value
    function getSettingValue(key: string, defaultValue: string): string {
      const row = settingsRows.find(r => r[0] === key);
      return row && row[1] !== undefined && row[1] !== null ? String(row[1]) : defaultValue;
    }

    // Get team stakeholder emails
    const teamId = getColValue('TeamID');
    const stakeholderSettingKey = `team_${teamId}_stakeholders`;
    const stakeholderEmailsStr = getSettingValue(stakeholderSettingKey, '');
    const stakeholderEmails = stakeholderEmailsStr ? stakeholderEmailsStr.split(',').map(e => e.trim()).filter(Boolean) : [];

    console.log(`Team ID: ${teamId}`);
    console.log(`Stakeholders (${stakeholderEmails.length}): ${stakeholderEmails.join(', ') || 'None'}`);
    console.log('');

    // Prepare email information for dry run
    console.log('\n=== EMAIL DRY RUN ===\n');
    console.log('--- Report Email ---');
    console.log(`To: ${getColValue('AssignedByEmail')}`);
    console.log(`Subject: Report Submitted for Task: ${getColValue('Title')}`);
    console.log(`Report ID: RP-9181`);
    console.log(`Task ID: TSK-4373`);
    console.log(`Submitted By: ${getReportColValue('SubmittedByEmail')}`);
    console.log(`Report Date: ${getReportColValue('ReportDate')}`);
    console.log('');

    console.log('--- Overdue Task Emails ---');
    for (const task of overdueTasks) {
      const getTaskColValue = (colName: string) => {
        const colIndex = headerRow.findIndex(col => col === colName);
        return colIndex !== -1 ? task[colIndex] : 'N/A';
      };
      
      const assignedToEmail = getTaskColValue('AssignedToEmail');
      const assignedByEmail = getTaskColValue('AssignedByEmail');
      
      // Use assignedToEmail as primary recipients (the people assigned to the task)
      const recipients = assignedToEmail && assignedToEmail !== 'N/A' 
        ? assignedToEmail.split(',').map(e => e.trim()).filter(Boolean)
        : [assignedByEmail];
      
      console.log(`Task: ${getTaskColValue('Title')} (${getTaskColValue('TaskID')})`);
      console.log(`To (Assigned To): ${recipients.join(', ')}`);
      console.log(`Subject: OVERDUE: ${getTaskColValue('Title')}`);
      console.log(`Due Date: ${getTaskColValue('DueDate')}`);
      console.log(`Status: ${getTaskColValue('Status')}`);
      console.log(`Team ID: ${getTaskColValue('TeamID')}`);
      console.log('');
    }

    console.log('--- Due Today Task Emails ---');
    for (const task of dueTodayTasks) {
      const getTaskColValue = (colName: string) => {
        const colIndex = headerRow.findIndex(col => col === colName);
        return colIndex !== -1 ? task[colIndex] : 'N/A';
      };
      
      const assignedToEmail = getTaskColValue('AssignedToEmail');
      const assignedByEmail = getTaskColValue('AssignedByEmail');
      
      // Use assignedToEmail as primary recipients (the people assigned to the task)
      const recipients = assignedToEmail && assignedToEmail !== 'N/A' 
        ? assignedToEmail.split(',').map(e => e.trim()).filter(Boolean)
        : [assignedByEmail];
      
      console.log(`Task: ${getTaskColValue('Title')} (${getTaskColValue('TaskID')})`);
      console.log(`To (Assigned To): ${recipients.join(', ')}`);
      console.log(`Subject: DUE TODAY: ${getTaskColValue('Title')}`);
      console.log(`Due Date: ${getTaskColValue('DueDate')}`);
      console.log(`Status: ${getTaskColValue('Status')}`);
      console.log(`Team ID: ${getTaskColValue('TeamID')}`);
      console.log('');
    }

    console.log('\n=== DRY RUN COMPLETE ===');
    console.log('Please review the above email information and approve to proceed with sending.');

  } catch (error) {
    console.error('Error checking report:', error);
    process.exit(1);
  }
}

checkReportRP9181()
  .then(() => {
    console.log('\nScript execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript execution failed:', error);
    process.exit(1);
  });
