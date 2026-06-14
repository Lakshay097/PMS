export interface AppsScriptFile {
  name: string;
  type: 'gs' | 'html';
  description: string;
  code: string;
}

export const APPS_SCRIPT_FILES: AppsScriptFile[] = [
  {
    name: "Code.gs",
    type: "gs",
    description: "Web App entry point, request routing, and central API dispatcher wrapped in gas LockService.",
    code: `/**
 * TrustGrid TaskFlow - Core Controller
 * Handles HTTP GET requests, boots the SPA, and dispatches AJAX RPC requests safely.
 */

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle("TrustGrid TaskFlow")
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Route AJAX operations requested by the frontend.
 * Evaluates credentials and role permissions server-side under LockService.
 */
function handleClientRequest(action, payload) {
  const lock = LockService.getScriptLock();
  try {
    // Acquire lock for up to 10 seconds to safeguard multi-row concurrent transactions
    lock.waitLock(10000);
    
    // 1. Identify and authenticate user email using active Session
    const activeUserEmail = Session.getActiveUser().getEmail();
    if (!activeUserEmail) {
      return { success: false, message: "Authentication failed. No active Google Session found." };
    }
    
    // 2. Fetch User identity and role permissions mapping from Spreadsheet DB
    const user = getUserByEmail_(activeUserEmail);
    if (!user || !user.Active) {
      return { success: false, message: "Unauthorized. User " + activeUserEmail + " is not registered or is inactive." };
    }
    
    // 3. Dispatch action based on requested command
    switch (action) {
      case 'getCurrentUser':
        return { success: true, data: user };
        
      case 'getDashboardData':
        return getDashboardData_(user);
        
      case 'getTasks':
        return getTasks_(user, payload.filters);
        
      case 'createTask':
        return createTask_(user, payload.taskData);
        
      case 'updateTask':
        return updateTask_(user, payload.taskId, payload.updates);
        
      case 'submitTaskReport':
        return submitTaskReport_(user, payload.reportData);
        
      case 'closeTask':
        return closeTask_(user, payload.taskId, payload.closeRemark);
        
      case 'createFollowUp':
        return createFollowUp_(user, payload.followUpData);
        
      case 'getUsersAndTeams':
        return getUsersAndTeams_(user);
        
      case 'generateRecurringTasks':
        // Run scheduled recurrent task creation
        return generateRecurringTasks_();
        
      default:
        return { success: false, message: "System error. Action '" + action + "' is unrecognized or unsupported." };
    }
  } catch (error) {
    Logger.log("Execution error: " + error.toString());
    return { success: false, message: "Server-side exception: " + error.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Trigger wrapper for Apps Script Time-Driven Triggers.
 * This triggers recurring task instance creation on a daily interval.
 */
function triggerScheduledRecurrenceEngine() {
  Logger.log("Triggering scheduled recurrence engine...");
  const result = generateRecurringTasks_();
  Logger.log("Recurrence engine run complete: " + JSON.stringify(result));
}
`
  },
  {
    name: "Auth.gs",
    type: "gs",
    description: "Authentication validation, spreadsheet mapping of role credentials, and team scoping helpers.",
    code: `/**
 * TrustGrid TaskFlow - Identity & Authorization Manager
 * Resolves permissions and strictly filters database lookups based on roles.
 */

/**
 * Retrieves the user record matching the active email.
 */
function getUserByEmail_(email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  
  const headers = data[0];
  const emailIdx = headers.indexOf("Email");
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][emailIdx].toString().trim().toLowerCase() === email.trim().toLowerCase()) {
      const user = {};
      headers.forEach((h, idx) => {
        let val = data[i][idx];
        if (h === 'Active' || h === 'CanCreateFollowUp' || h === 'CanCloseTask') {
          val = (val === true || val === 'TRUE');
        }
        user[h] = val;
      });
      return user;
    }
  }
  return null;
}

/**
 * Validates whether the logged in user has authority to work with or view certain items.
 * Rules:
 * - Admin: Full clearance
 * - Stakeholder: Clear for self tasks, or tasks originating/directed to their team (TeamID matching Stakeholder's TeamID)
 * - Sub-stakeholder: Only clear for tasks explicitly assigned to self.
 */
function checkTaskVisibility_(user, taskRow, headers) {
  if (user.Role === 'Admin') return true;
  
  const assignedToEmailIdx = headers.indexOf("AssignedToEmail");
  const assignedByEmailIdx = headers.indexOf("AssignedByEmail");
  const teamIdIdx = headers.indexOf("TeamID");
  
  const assignedTo = taskRow[assignedToEmailIdx];
  const assignedBy = taskRow[assignedByEmailIdx];
  const taskTeamId = taskRow[teamIdIdx];
  
  if (user.Role === 'Stakeholder') {
    // Stakeholder can see tasks within their team, or tasks they assigned, or tasks assigned to them
    return (taskTeamId === user.TeamID || assignedTo === user.Email || assignedBy === user.Email);
  }
  
  if (user.Role === 'Sub-stakeholder') {
    // Sub-stakeholder only sees tasks explicitly assigned to them
    return (assignedTo === user.Email);
  }
  
  return false;
}

/**
 * Validates whether active user can assign a task to target receiver.
 * Rules:
 * - Admin: Can assign to anyone.
 * - Stakeholder: Can assign only to sub-stakeholders holding active managerEmail matching self email.
 * - Sub-stakeholder: Denied assignment permission entirely.
 */
function checkAssignmentAuthority_(user, targetUserEmail) {
  if (user.Role === 'Admin') return true;
  if (user.Role === 'Sub-stakeholder') return false;
  
  if (user.Role === 'Stakeholder') {
    const targetUser = getUserByEmail_(targetUserEmail);
    if (!targetUser) return false;
    return (targetUser.ManagerEmail === user.Email && targetUser.TeamID === user.TeamID);
  }
  
  return false;
}
`
  },
  {
    name: "Tasks.gs",
    type: "gs",
    description: "Task fetching, creation parsing, status reporting, follow-up links, and status transition checkers.",
    code: `/**
 * TrustGrid TaskFlow - Task Operations Service
 */

/**
 * Fetch and filter tasks list honoring strict role restrictions.
 */
function getTasks_(user, filters) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const taskSheet = ss.getSheetByName("Tasks");
  const data = taskSheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, data: [] };
  
  const headers = data[0];
  const activeIdx = headers.indexOf("Active");
  const dueDateIdx = headers.indexOf("DueDate");
  const statusIdx = headers.indexOf("Status");
  const assignedToIdx = headers.indexOf("AssignedToEmail");
  const createdIdx = headers.indexOf("CreatedAt");
  
  const outTasks = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // Skip soft-deleted/inactive rows
    if (row[activeIdx] === false || row[activeIdx] === 'FALSE') continue;
    
    // Check role-based visibility rules server-side
    if (!checkTaskVisibility_(user, row, headers)) continue;
    
    const task = {};
    headers.forEach((h, idx) => {
      let val = row[idx];
      if (h === 'Active' || h === 'RequiresFollowUp') {
        val = (val === true || val === 'TRUE' || val === 'Yes');
      }
      task[h] = val;
    });
    
    // Dynamically derive Overdue status
    if (task.Status !== 'Closed' && task.Status !== 'Reviewed') {
      const dueDate = new Date(task.DueDate);
      dueDate.setHours(0,0,0,0);
      if (dueDate < today) {
        task.Status = 'Overdue';
        // Note: We do not write of all states to sheets on every read to preserve storage cycles,
        // but it is dynamic in user reports
      }
    }
    
    // Apply Frontend Filters server-side to limit bandwidth
    if (filters) {
      if (filters.status && filters.status !== 'All') {
        if (filters.status === 'Overdue' && task.Status !== 'Overdue') continue;
        if (filters.status !== 'Overdue' && task.Status !== filters.status) continue;
      }
      if (filters.priority && filters.priority !== 'All' && task.Priority !== filters.priority) continue;
      if (filters.category && filters.category !== 'All' && task.Category !== filters.category) continue;
    }
    
    outTasks.push(task);
  }
  
  // Sort by CreatedAt desc
  outTasks.sort((a,b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
  
  return { success: true, data: outTasks };
}

/**
 * Create a new task instance.
 */
function createTask_(user, taskData) {
  // Confirm authorization rules
  if (user.Role === 'Sub-stakeholder') {
    return { success: false, message: "Denial: Sub-stakeholders are unauthorized to create tasks." };
  }
  
  if (!checkAssignmentAuthority_(user, taskData.AssignedToEmail)) {
    return { success: false, message: "Denial: You cannot assign tasks outside your mapped subordinates." };
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Tasks");
  const headers = sheet.getDataRange().getValues()[0];
  
  const newTaskId = "TSK-" + generateUUID_().substring(0, 8).toUpperCase();
  const nowStr = new Date().toISOString();
  
  const recipient = getUserByEmail_(taskData.AssignedToEmail);
  
  const newRow = headers.map(h => {
    switch (h) {
      case 'TaskID': return newTaskId;
      case 'TemplateID': return taskData.TemplateID || '';
      case 'ParentTaskID': return taskData.ParentTaskID || '';
      case 'Title': return taskData.Title;
      case 'Description': return taskData.Description;
      case 'Category': return taskData.Category;
      case 'Priority': return taskData.Priority;
      case 'TaskType': return taskData.TaskType || 'One-time';
      case 'RecurrenceType': return taskData.RecurrenceType || 'One-time';
      case 'CycleKey': return taskData.CycleKey || '';
      case 'StartDate': return taskData.StartDate;
      case 'DueDate': return taskData.DueDate;
      case 'AssignedByEmail': return user.Email;
      case 'AssignedToEmail': return taskData.AssignedToEmail;
      case 'AssignedToRole': return recipient ? recipient.Role : 'Sub-stakeholder';
      case 'TeamID': return recipient ? recipient.TeamID : user.TeamID;
      case 'Status': return 'Not Started';
      case 'PercentComplete': return 0;
      case 'LastReportSummary': return '';
      case 'RequiresFollowUp': return 'No';
      case 'FollowUpCount': return 0;
      case 'CompletionDate': return '';
      case 'CloseRemark': return '';
      case 'AttachmentLink': return taskData.AttachmentLink || '';
      case 'CreatedAt': return nowStr;
      case 'UpdatedAt': return nowStr;
      case 'Active': return true;
      default: return '';
    }
  });
  
  sheet.appendRow(newRow);
  
  logAudit_("Task", newTaskId, "Task Creation", "", JSON.stringify(taskData), user.Email);
  return { success: true, message: "Task " + newTaskId + " created successfully.", data: { TaskID: newTaskId } };
}

/**
 * Submit progress updates on a task.
 */
function submitTaskReport_(user, reportData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const taskSheet = ss.getSheetByName("Tasks");
  const reportSheet = ss.getSheetByName("TaskReports");
  
  // Verify task exists and is active
  const taskRowDetails = findRowByKeyValue_(taskSheet, "TaskID", reportData.TaskID);
  if (!taskRowDetails) {
    return { success: false, message: "Task not found." };
  }
  
  const taskHeaders = taskSheet.getDataRange().getValues()[0];
  const activeIdx = taskHeaders.indexOf("Active");
  const assignedToEmailIdx = taskHeaders.indexOf("AssignedToEmail");
  
  if (taskRowDetails.row[activeIdx] === false || taskRowDetails.row[activeIdx] === 'FALSE') {
    return { success: false, message: "Task is inactive/soft-deleted." };
  }
  
  // Scopes check: Only allow assignee (or Admin) to append progress reports
  if (user.Role !== 'Admin' && taskRowDetails.row[assignedToEmailIdx] !== user.Email) {
    return { success: false, message: "Decline: You are not authorized to submit reports on this task." };
  }
  
  const reportId = "RP-" + generateUUID_().substring(0, 8).toUpperCase();
  const nowStr = new Date().toISOString();
  
  const reportHeaders = reportSheet.getDataRange().getValues()[0];
  const newReportRow = reportHeaders.map(h => {
    switch (h) {
      case 'ReportID': return reportId;
      case 'TaskID': return reportData.TaskID;
      case 'SubmittedByEmail': return user.Email;
      case 'ReportDate': return reportData.ReportDate || nowStr.split('T')[0];
      case 'StatusUpdate': return reportData.StatusUpdate;
      case 'WorkSummary': return reportData.WorkSummary;
      case 'PercentComplete': return Number(reportData.PercentComplete) || 0;
      case 'Blockers': return reportData.Blockers || '';
      case 'NextAction': return reportData.NextAction || '';
      case 'AttachmentLink': return reportData.AttachmentLink || '';
      case 'CreatedAt': return nowStr;
      default: return '';
    }
  });
  
  reportSheet.appendRow(newReportRow);
  
  // Read before overwrite to logs
  const oldStatus = taskRowDetails.row[taskHeaders.indexOf("Status")];
  
  // Synchronously update status & percent in parallel Task row
  const updates = {
    "Status": reportData.StatusUpdate,
    "PercentComplete": Number(reportData.PercentComplete) || 0,
    "LastReportSummary": reportData.WorkSummary,
    "AttachmentLink": reportData.AttachmentLink || taskRowDetails.row[taskHeaders.indexOf("AttachmentLink")]
  };
  
  updateTaskRowDetails_(taskSheet, taskRowDetails.rowNum, updates);
  
  logAudit_("Report", reportId, "Status Report Published", "", JSON.stringify(updates), user.Email);
  return { success: true, message: "Progress report lodged. Task updated." };
}

/**
 * Handles completing/closing tasks.
 * Admins, Stakeholders, or users possessing close clearance (CanCloseTask = true) are permitted.
 */
function closeTask_(user, taskId, closeRemark) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const taskSheet = ss.getSheetByName("Tasks");
  
  const taskRowDetails = findRowByKeyValue_(taskSheet, "TaskID", taskId);
  if (!taskRowDetails) return { success: false, message: "Task not found." };
  
  const headers = taskSheet.getDataRange().getValues()[0];
  const assignedToIdx = headers.indexOf("AssignedToEmail");
  const assignedTo = taskRowDetails.row[assignedToIdx];
  
  // Validation checks
  const canClose = user.Role === 'Admin' || user.Role === 'Stakeholder' || (user.CanCloseTask && assignedTo === user.Email);
  if (!canClose) {
    return { success: false, message: "Denial: You lack necessary authorization privileges to close this task." };
  }
  
  const nowStr = new Date().toISOString();
  const updates = {
    "Status": "Closed",
    "PercentComplete": 100,
    "CompletionDate": nowStr.split('T')[0],
    "CloseRemark": closeRemark,
    "UpdatedAt": nowStr
  };
  
  updateTaskRowDetails_(taskSheet, taskRowDetails.rowNum, updates);
  
  logAudit_("Task", taskId, "Task Cleared & Closed", "", JSON.stringify(updates), user.Email);
  return { success: true, message: "Task successfully transitioned to Closed state." };
}
`
  },
  {
    name: "Recurrence.gs",
    type: "gs",
    description: "Recurrence template processor, period calculations, and scheduled run safety loops.",
    code: `/**
 * TrustGrid TaskFlow - Scheduled Recurrence Engine
 */

/**
 * Scans all recurring task templates and spawns active task records if scheduled.
 */
function generateRecurringTasks_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const templateSheet = ss.getSheetByName("TaskTemplates");
  const taskSheet = ss.getSheetByName("Tasks");
  
  const templatesData = templateSheet.getDataRange().getValues();
  if (templatesData.length <= 1) return { success: true, generated: 0, message: "No templates loaded." };
  
  const templateHeaders = templatesData[0];
  const tasksHeaders = taskSheet.getDataRange().getValues()[0];
  
  const todayStr = new Date().toISOString().split('T')[0];
  const today = new Date(todayStr); // strip hours
  
  let generatedCount = 0;
  
  // Read existing CycleKeys into hashmap to guarantee absolute idiqueness and prevent double booking
  const existingCycleKeys = {};
  if (taskSheet.getLastRow() > 1) {
    const tasksData = taskSheet.getDataRange().getValues();
    const cycleKeyIdx = tasksHeaders.indexOf("CycleKey");
    for (let j = 1; j < tasksData.length; j++) {
      const keyVal = tasksData[j][cycleKeyIdx];
      if (keyVal) {
        existingCycleKeys[keyVal] = true;
      }
    }
  }
  
  // Columns pointers in Templates
  const templateIdIdx = templateHeaders.indexOf("TemplateID");
  const titleIdx = templateHeaders.indexOf("Title");
  const descIdx = templateHeaders.indexOf("Description");
  const categoryIdx = templateHeaders.indexOf("Category");
  const priorityIdx = templateHeaders.indexOf("Priority");
  const recurrenceTypeIdx = templateHeaders.indexOf("RecurrenceType");
  const nextGenIdx = templateHeaders.indexOf("NextGenerationDate");
  const lastGenIdx = templateHeaders.indexOf("LastGeneratedDate");
  const assignedByIdx = templateHeaders.indexOf("AssignedByEmail");
  const assignedToIdx = templateHeaders.indexOf("AssignedToEmail");
  const assignedToRoleIdx = templateHeaders.indexOf("AssignedToRole");
  const teamIdIdx = templateHeaders.indexOf("TeamID");
  const activeIdx = templateHeaders.indexOf("Active");
  
  for (let i = 1; i < templatesData.length; i++) {
    const row = templatesData[i];
    
    // Skip disabled blueprints
    if (row[activeIdx] === false || row[activeIdx] === 'FALSE') continue;
    
    const nextGenDateVal = row[nextGenIdx];
    if (!nextGenDateVal) continue;
    
    const nextGenDate = new Date(nextGenDateVal);
    nextGenDate.setHours(0,0,0,0);
    
    // If schedule matches or is overdue
    if (nextGenDate <= today) {
      const templateId = row[templateIdIdx];
      const recurrenceType = row[recurrenceTypeIdx];
      
      // Construct cycle key, i.e., TMP-501_2026-06-15 or similar
      const cycleDateStr = nextGenDate.toISOString().split('T')[0];
      let cycleSuffix = cycleDateStr;
      
      // Customize suffix if needed
      if (recurrenceType === 'Weekly') {
        cycleSuffix = "W-" + cycleDateStr;
      } else if (recurrenceType === 'Quarterly') {
        cycleSuffix = "Q-" + cycleDateStr.substring(0, 7);
      }
      
      const cycleKey = templateId + "_" + cycleSuffix;
      
      // Deduplication verification
      if (existingCycleKeys[cycleKey]) {
        // Already built. Update next dates to avoid getting stuck in loops and continue
        const nextFutureDate = calculateNextOccurrence_(nextGenDate, recurrenceType);
        updateTemplateDates_(templateSheet, i + 1, cycleDateStr, nextFutureDate.toISOString().split('T')[0]);
        continue;
      }
      
      // Calculate due date (Template starts have standard offsets, e.g., 7 days limit)
      const dueDaysOffset = getDueDateOffsetForRecurrence_(recurrenceType);
      const dueDate = new Date(nextGenDate);
      dueDate.setDate(dueDate.getDate() + dueDaysOffset);
      const dueDateStr = dueDate.toISOString().split('T')[0];
      
      const newTaskId = "TSK-" + generateUUID_().substring(0, 8).toUpperCase();
      const nowStr = new Date().toISOString();
      
      // Append task row
      const newTaskRow = tasksHeaders.map(h => {
        switch (h) {
          case 'TaskID': return newTaskId;
          case 'TemplateID': return templateId;
          case 'ParentTaskID': return '';
          case 'Title': return row[titleIdx] + " - [Cycle " + cycleSuffix + "]";
          case 'Description': return row[descIdx];
          case 'Category': return row[categoryIdx];
          case 'Priority': return row[priorityIdx];
          case 'TaskType': return 'Recurring';
          case 'RecurrenceType': return recurrenceType;
          case 'CycleKey': return cycleKey;
          case 'StartDate': return cycleDateStr;
          case 'DueDate': return dueDateStr;
          case 'AssignedByEmail': return row[assignedByIdx];
          case 'AssignedToEmail': return row[assignedToIdx];
          case 'AssignedToRole': return row[assignedToRoleIdx];
          case 'TeamID': return row[teamIdIdx];
          case 'Status': return 'Not Started';
          case 'PercentComplete': return 0;
          case 'LastReportSummary': return '';
          case 'RequiresFollowUp': return 'No';
          case 'FollowUpCount': return 0;
          case 'CompletionDate': return '';
          case 'CloseRemark': return '';
          case 'AttachmentLink': return '';
          case 'CreatedAt': return nowStr;
          case 'UpdatedAt': return nowStr;
          case 'Active': return true;
          default: return '';
        }
      });
      
      taskSheet.appendRow(newTaskRow);
      generatedCount++;
      
      // Compute next schedule date from current due trigger date
      const nextFutureDate = calculateNextOccurrence_(nextGenDate, recurrenceType);
      
      // Update spreadsheet template schedule pointers
      updateTemplateDates_(
        templateSheet,
        i + 1,
        cycleDateStr,
        nextFutureDate.toISOString().split('T')[0]
      );
      
      logAudit_("Task", newTaskId, "Automatic Recurrence Spawning", "", JSON.stringify({ TemplateID: templateId, CycleKey: cycleKey }), "system_trigger");
    }
  }
  
  return { success: true, generated: generatedCount, message: "Successfully generated " + generatedCount + " recurring tasks." };
}

/**
 * Calculates due date offsets
 */
function getDueDateOffsetForRecurrence_(freq) {
  switch (freq) {
    case 'Daily': return 1;
    case 'Weekly': return 7;
    case 'Monthly': return 14;
    case 'Quarterly': return 21;
    case 'Half-yearly': return 30;
    default: return 7;
  }
}

/**
 * Steps the date picker to the next cycle based on schedule boundaries.
 */
function calculateNextOccurrence_(startDate, frequency) {
  const date = new Date(startDate);
  switch (frequency) {
    case 'Daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'Weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'Monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'Quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'Half-yearly':
      date.setMonth(date.getMonth() + 6);
      break;
  }
  return date;
}

function updateTemplateDates_(sheet, rowNum, lastVal, nextVal) {
  const headers = sheet.getDataRange().getValues()[0];
  const lastIdx = headers.indexOf("LastGeneratedDate") + 1;
  const nextIdx = headers.indexOf("NextGenerationDate") + 1;
  const updateIdx = headers.indexOf("UpdatedAt") + 1;
  
  sheet.getRange(rowNum, lastIdx).setValue(lastVal);
  sheet.getRange(rowNum, nextIdx).setValue(nextVal);
  if (updateIdx > 0) {
    sheet.getRange(rowNum, updateIdx).setValue(new Date().toISOString());
  }
}
`
  },
  {
    name: "FollowUps.gs",
    type: "gs",
    description: "Follow-up creator validating permissions, link indexing, and parent count updating.",
    code: `/**
 * TrustGrid TaskFlow - Link follow-up instances
 */

function createFollowUp_(user, followUpData) {
  // Authorization rules validation
  if (!user.CanCreateFollowUp) {
    return { success: false, message: "Decline: You are not authorized to create follow-ups." };
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const taskSheet = ss.getSheetByName("Tasks");
  const followUpSheet = ss.getSheetByName("FollowUps");
  
  // 1. Trace Parent task details
  const parentDetails = findRowByKeyValue_(taskSheet, "TaskID", followUpData.ParentTaskID);
  if (!parentDetails) return { success: false, message: "Target Parent Task not found." };
  
  const parentHeaders = taskSheet.getDataRange().getValues()[0];
  const parentStatus = parentDetails.row[parentHeaders.indexOf("Status")];
  const teamIdIdx = parentHeaders.indexOf("TeamID");
  const assignedToEmailIdx = parentHeaders.indexOf("AssignedToEmail");
  
  if (parentStatus !== 'Closed') {
    return { success: false, message: "Follow-ups can only be generated for Closed tasks." };
  }
  
  if (user.Role !== 'Admin' && parentDetails.row[teamIdIdx] !== user.TeamID) {
    return { success: false, message: "Decline: You cannot create a follow-up for a task outside your team." };
  }
  
  // Increment FollowUpCount on the parent task
  const currentCount = Number(parentDetails.row[parentHeaders.indexOf("FollowUpCount")]) || 0;
  const newFollowUpCount = currentCount + 1;
  
  updateTaskRowDetails_(taskSheet, parentDetails.rowNum, {
    "RequiresFollowUp": "Yes",
    "FollowUpCount": newFollowUpCount,
    "UpdatedAt": new Date().toISOString()
  });
  
  // 2. Spawn the new follow-up reference task
  const newTaskId = "TSK-" + generateUUID_().substring(0, 8).toUpperCase();
  const nowStr = new Date().toISOString();
  
  const dueDateOffset = 7; // default 7 day timeline
  const today = new Date();
  const due = new Date();
  due.setDate(today.getDate() + dueDateOffset);
  
  const taskRecipientEmail = parentDetails.row[assignedToEmailIdx];
  const activeRecipient = getUserByEmail_(taskRecipientEmail);
  
  const newTaskRow = parentHeaders.map(h => {
    switch (h) {
      case 'TaskID': return newTaskId;
      case 'TemplateID': return '';
      case 'ParentTaskID': return parentDetails.row[parentHeaders.indexOf("TaskID")];
      case 'Title': return "Follow-up #" + newFollowUpCount + ": " + parentDetails.row[parentHeaders.indexOf("Title")].replace(/\\s-\\[Cycle.*\\]/g, "");
      case 'Description': return "REASON FOR FOLLOW-UP: " + followUpData.Reason + "\\n\\nORIGINAL TASK: " + parentDetails.row[parentHeaders.indexOf("Description")];
      case 'Category': return parentDetails.row[parentHeaders.indexOf("Category")];
      case 'Priority': return "Medium";
      case 'TaskType': return "One-time";
      case 'RecurrenceType': return "One-time";
      case 'CycleKey': return '';
      case 'StartDate': return today.toISOString().split('T')[0];
      case 'DueDate': return due.toISOString().split('T')[0];
      case 'AssignedByEmail': return user.Email;
      case 'AssignedToEmail': return taskRecipientEmail;
      case 'AssignedToRole': return activeRecipient ? activeRecipient.Role : 'Sub-stakeholder';
      case 'TeamID': return parentDetails.row[teamIdIdx];
      case 'Status': return 'Not Started';
      case 'PercentComplete': return 0;
      case 'LastReportSummary': return '';
      case 'RequiresFollowUp': return 'No';
      case 'FollowUpCount': return 0;
      case 'CompletionDate': return '';
      case 'CloseRemark': return '';
      case 'AttachmentLink': return '';
      case 'CreatedAt': return nowStr;
      case 'UpdatedAt': return nowStr;
      case 'Active': return true;
      default: return '';
    }
  });
  
  taskSheet.appendRow(newTaskRow);
  
  // 3. Append to FollowUps sheet
  const followUpId = "FLW-" + generateUUID_().substring(0, 8).toUpperCase();
  const followUpHeaders = followUpSheet.getDataRange().getValues()[0];
  const newFollowUpRow = followUpHeaders.map(h => {
    switch (h) {
      case 'FollowUpID': return followUpId;
      case 'ParentTaskID': return followUpData.ParentTaskID;
      case 'NewTaskID': return newTaskId;
      case 'FollowUpNumber': return newFollowUpCount;
      case 'CreatedByEmail': return user.Email;
      case 'Reason': return followUpData.Reason;
      case 'CreatedAt': return nowStr;
      case 'Status': return 'Active';
      default: return '';
    }
  });
  
  followUpSheet.appendRow(newFollowUpRow);
  
  logAudit_("FollowUp", followUpId, "Follow-Up Sparked", "", JSON.stringify({ ParentID: followUpData.ParentTaskID, LinkTaskID: newTaskId }), user.Email);
  return { success: true, message: "Follow-up successfully created and linked to task: " + newTaskId };
}
`
  },
  {
    name: "Utils.gs",
    type: "gs",
    description: "Database lookup utilities, logging triggers, and RFC-4122 random UUID generator.",
    code: `/**
 * TrustGrid TaskFlow - Global System Utilities
 */

/**
 * Searches a target Sheet based on column name key and specific value.
 * Returns both the matching row array and exact row line offset pointer.
 */
function findRowByKeyValue_(sheet, keyName, value) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  const headers = data[0];
  const idx = headers.indexOf(keyName);
  if (idx === -1) return null;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][idx].toString() === value.toString()) {
      return {
        row: data[i],
        rowNum: i + 1 // 1-based indexing for row ranges (+1 header offset)
      };
    }
  }
  return null;
}

/**
 * Updates columns dynamically by row index without resetting unrelated cells.
 */
function updateTaskRowDetails_(sheet, rowNum, updatesMap) {
  const headers = sheet.getDataRange().getValues()[0];
  for (const key in updatesMap) {
    const colIdx = headers.indexOf(key);
    if (colIdx !== -1) {
      sheet.getRange(rowNum, colIdx + 1).setValue(updatesMap[key]);
    }
  }
}

/**
 * Audit Log Dispatcher.
 */
function logAudit_(entityType, entityId, action, oldVal, newVal, actorEmail) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("AuditLogs");
    const headers = sheet.getDataRange().getValues()[0];
    
    const logId = "LOG-" + generateUUID_().substring(0, 8).toUpperCase();
    const nowStr = new Date().toISOString();
    
    const newRow = headers.map(h => {
      switch (h) {
        case 'LogID': return logId;
        case 'EntityType': return entityType;
        case 'EntityID': return entityId;
        case 'Action': return action;
        case 'OldValueJSON': return oldVal || '';
        case 'NewValueJSON': return newVal || '';
        case 'ActionByEmail': return actorEmail;
        case 'ActionDateTime': return nowStr;
        default: return '';
      }
    });
    sheet.appendRow(newRow);
  } catch (err) {
    Logger.log("Audit error: " + err.toString());
  }
}

/**
 * Generate highly unique IDs matching Apps Script engine specs.
 */
function generateUUID_() {
  try {
    return Utilities.getUuid();
  } catch (err) {
    return 'xxxx-xxxx-xxxx-xxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

function getUsersAndTeams_(user) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("Users");
  const userData = userSheet.getDataRange().getValues();
  const teamSheet = ss.getSheetByName("Teams");
  const teamData = teamSheet.getDataRange().getValues();
  
  const users = [];
  const uHeaders = userData[0];
  for (let i = 1; i < userData.length; i++) {
    const u = {};
    uHeaders.forEach((h, idx) => {
      let val = userData[i][idx];
      if (h === 'Active' || h === 'CanCreateFollowUp' || h === 'CanCloseTask') {
        val = (val === true || val === 'TRUE');
      }
      u[h] = val;
    });
    users.push(u);
  }
  
  const teams = [];
  const tHeaders = teamData[0];
  for (let idx = 1; idx < teamData.length; idx++) {
    const t = {};
    tHeaders.forEach((h, colIdx) => {
      let val = teamData[idx][colIdx];
      if (h === 'Active') {
        val = (val === true || val === 'TRUE');
      }
      t[h] = val;
    });
    teams.push(t);
  }
  
  return { success: true, data: { users, teams } };
}

function getDashboardData_(user) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tasksRes = getTasks_(user, null);
  const followUpSheet = ss.getSheetByName("FollowUps");
  const fData = followUpSheet.getDataRange().getValues();
  
  let totalTasks = 0;
  let openTasks = 0;
  let closedTasks = 0;
  let overdueTasks = 0;
  let followUpsPending = 0;
  
  if (tasksRes.success) {
    const list = tasksRes.data;
    totalTasks = list.length;
    list.forEach(t => {
      if (t.Status === 'Closed' || t.Status === 'Reviewed') {
        closedTasks++;
      } else {
        openTasks++;
        if (t.Status === 'Overdue') {
          overdueTasks++;
        }
      }
    });
  }
  
  // Pending follow-ups
  const fHeaders = fData[0];
  const fStatusIdx = fHeaders.indexOf("Status");
  const fActorIdx = fHeaders.indexOf("CreatedByEmail");
  for (let i = 1; i < fData.length; i++) {
    const status = fData[i][fStatusIdx];
    const actor = fData[i][fActorIdx];
    if (status === 'Active' || status === 'Pending') {
      if (user.Role === 'Admin' || actor === user.Email) {
        followUpsPending++;
      }
    }
  }
  
  return {
    success: true,
    data: {
      totalTasks: totalTasks,
      openTasks: openTasks,
      closedTasks: closedTasks,
      overdueTasks: overdueTasks,
      followUpsPending: followUpsPending
    }
  };
}
`
  },
  {
    name: "Index.html",
    type: "html",
    description: "Primary UI scaffold and single page layout connecting all Google App structures.",
    code: `<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <!-- Include Tailwind CDN and Font Styles -->
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
  </style>
  <?!= HtmlService.createHtmlOutputFromFile('Styles').getContent(); ?>
</head>
<body class="bg-slate-50 text-slate-800">
  <div id="app" class="min-h-screen flex flex-col md:flex-row">
    <!-- Sidebar -->
    <aside class="w-full md:w-64 bg-slate-900 text-white flex-shrink-0">
      <div class="p-6 border-b border-slate-800 flex items-center justify-between">
        <h1 class="font-bold text-lg tracking-tight">TrustGrid <span class="text-blue-400">TaskFlow</span></h1>
      </div>
      <nav id="nav-container" class="p-4 space-y-1">
        <!-- Javascript renders active routes mapping -->
      </nav>
      <div class="absolute bottom-4 left-6 text-xs text-slate-500" id="user-display">
        Resolving session...
      </div>
    </aside>

    <!-- Main Workspace -->
    <main class="flex-1 flex flex-col min-h-screen overflow-x-hidden">
      <!-- Top header bar -->
      <header class="bg-white border-b border-slate-200 py-4 px-8 flex items-center justify-between">
        <h2 class="text-xl font-semibold text-slate-800" id="view-title">Dashboard Home</h2>
        <div class="flex items-center space-x-4">
          <span class="text-xs bg-emerald-50 text-emerald-700 font-medium px-2.5 py-1 rounded-full border border-emerald-100 uppercase" id="role-badge">Scope</span>
        </div>
      </header>

      <!-- Grid layout -->
      <div class="p-8 flex-1" id="main-content">
        <!-- Render views dynamically -->
      </div>
    </main>
  </div>

  <?!= HtmlService.createHtmlOutputFromFile('Scripts').getContent(); ?>
</body>
</html>
`
  }
];
