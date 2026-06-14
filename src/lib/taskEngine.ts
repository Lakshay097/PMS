import { Task, TaskTemplate } from '../types';
import { dbService } from './dbService';

// Calculate the ISO week number for a date
function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Get the quarter of a date (1-4)
function getQuarter(d: Date): number {
  return Math.floor(d.getMonth() / 3) + 1;
}

// Generate the specific cycle key, start date, and due date for a given frequency
export function getCurrentCycleDetails(
  type: TaskTemplate['RecurrenceType'], 
  baseDate: Date = new Date()
): { cycleKey: string; startDate: string; dueDate: string } {
  const year = baseDate.getFullYear();
  let cycleKey = '';
  let startDate = '';
  let dueDate = '';

  switch (type) {
    case 'Daily': {
      const monthStr = String(baseDate.getMonth() + 1).padStart(2, '0');
      const dayStr = String(baseDate.getDate()).padStart(2, '0');
      cycleKey = `${year}-${monthStr}-${dayStr}`;
      
      startDate = `${year}-${monthStr}-${dayStr}`;
      dueDate = startDate; // Due same day
      break;
    }
    case 'Weekly': {
      const week = getWeekNumber(baseDate);
      cycleKey = `${year}-W${String(week).padStart(2, '0')}`;
      
      // Calculate Monday of this week
      const day = baseDate.getDay();
      const diff = baseDate.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(baseDate.setDate(diff));
      const monthStr = String(monday.getMonth() + 1).padStart(2, '0');
      const dayStr = String(monday.getDate()).padStart(2, '0');
      startDate = `${monday.getFullYear()}-${monthStr}-${dayStr}`;
      
      // Due on Sunday
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const sMonthStr = String(sunday.getMonth() + 1).padStart(2, '0');
      const sDayStr = String(sunday.getDate()).padStart(2, '0');
      dueDate = `${sunday.getFullYear()}-${sMonthStr}-${sDayStr}`;
      break;
    }
    case 'Monthly': {
      const monthStr = String(baseDate.getMonth() + 1).padStart(2, '0');
      cycleKey = `${year}-${monthStr}`;
      
      startDate = `${year}-${monthStr}-01`;
      
      // End of month
      const lastDay = new Date(year, baseDate.getMonth() + 1, 0).getDate();
      dueDate = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
      break;
    }
    case 'Quarterly': {
      const q = getQuarter(baseDate);
      cycleKey = `${year}-Q${q}`;
      
      const startMonth = (q - 1) * 3 + 1;
      const endMonth = q * 3;
      
      startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
      
      const lastDay = new Date(year, endMonth, 0).getDate();
      dueDate = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      break;
    }
    case 'Half-yearly': {
      const h = baseDate.getMonth() < 6 ? 1 : 2;
      cycleKey = `${year}-H${h}`;
      
      const startMonth = h === 1 ? 1 : 7;
      const endMonth = h === 1 ? 6 : 12;
      
      startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
      
      const lastDay = new Date(year, endMonth, 0).getDate();
      dueDate = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      break;
    }
  }

  return { cycleKey, startDate, dueDate };
}

// Compute the next cycle generation date
export function calculateNextGenerationDate(
  type: TaskTemplate['RecurrenceType'], 
  lastDateStr: string
): string {
  const d = new Date(lastDateStr);
  if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];

  switch (type) {
    case 'Daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'Weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'Monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'Quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'Half-yearly':
      d.setMonth(d.getMonth() + 6);
      break;
  }
  return d.toISOString().split('T')[0];
}

// Runs over templates to generate active cycle task instances on-demand
export async function checkAndGenerateRecurringTasks(
  templates: TaskTemplate[],
  existingTasks: Task[]
): Promise<{ generatedCount: number; updatedTemplates: TaskTemplate[]; newTasks: Task[] }> {
  let generatedCount = 0;
  const updatedTemplates: TaskTemplate[] = [];
  const newTasks: Task[] = [];
  const now = new Date();

  // Filter templates that are active
  const activeTemplates = templates.filter(t => t.Active);

  for (const template of activeTemplates) {
    // 1. Calculate the standard cycle attributes for today
    const { cycleKey, startDate, dueDate } = getCurrentCycleDetails(template.RecurrenceType, now);
    
    // 2. See if there is already a live task generated matching standard template and cycle mapping
    const isAlreadyGenerated = existingTasks.some(
      task => task.TemplateID === template.TemplateID && task.CycleKey === cycleKey
    );

    if (!isAlreadyGenerated) {
      // 3. Create actual Task Instance
      const newTaskID = `TSK-REC-${Math.floor(Date.now() + Math.random() * 1000)}`;
      
      const generatedTask: Task = {
        TaskID: newTaskID,
        TemplateID: template.TemplateID,
        ParentTaskID: null,
        Title: `${template.Title} - [Cycle ${cycleKey}]`,
        Description: template.Description,
        Category: template.Category,
        Priority: template.Priority,
        TaskType: 'Recurring',
        RecurrenceType: template.RecurrenceType,
        CycleKey: cycleKey,
        StartDate: startDate,
        DueDate: dueDate,
        AssignedByEmail: template.AssignedByEmail,
        AssignedToEmail: template.AssignedToEmail,
        AssignedToRole: template.AssignedToRole,
        TeamID: template.TeamID,
        Status: 'Not Started',
        PercentComplete: 0,
        LastReportSummary: '',
        RequiresFollowUp: 'No',
        FollowUpCount: 0,
        CompletionDate: null,
        CloseRemark: null,
        AttachmentLink: '',
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
        Active: true
      };

      // Dave task using database service
      await dbService.saveTask(generatedTask);
      newTasks.push(generatedTask);

      // Append Audit Log
      await dbService.logAction(
        'Task',
        newTaskID,
        `Auto-Generated Recurring Instance for cycle ${cycleKey}`,
        'taskEngine@trustgrid.internal',
        null,
        generatedTask
      );

      // 4. Update the template's dates
      const nextGen = calculateNextGenerationDate(template.RecurrenceType, now.toISOString().split('T')[0]);
      const updatedTemplate: TaskTemplate = {
        ...template,
        LastGeneratedDate: now.toISOString().split('T')[0],
        NextGenerationDate: nextGen,
        UpdatedAt: new Date().toISOString()
      };

      await dbService.saveTemplate(updatedTemplate);
      updatedTemplates.push(updatedTemplate);

      generatedCount++;
    }
  }

  return { generatedCount, updatedTemplates, newTasks };
}

// Function to automatically update tasks to 'Overdue' status if actual due date is passed and status is not closed/submitted
export function evaluateOverdueTasks(tasks: Task[], currentEmail: string): Task[] {
  const currentDateStr = new Date().toISOString().split('T')[0];
  let changed = false;

  const evaluated = tasks.map(task => {
    // If not closed, reviewed, or submitted, and dueDate is in the past
    if (
      task.Status !== 'Closed' && 
      task.Status !== 'Submitted' && 
      task.Status !== 'Reviewed' &&
      task.Status !== 'Overdue' && 
      task.DueDate < currentDateStr
    ) {
      changed = true;
      const updated = { ...task, Status: 'Overdue' as const, UpdatedAt: new Date().toISOString() };
      // Async trigger persist
      dbService.saveTask(updated).catch(e => console.error(e));
      dbService.logAction(
        'Task',
        task.TaskID,
        'Auto-Marked Overdue (Passed due date)',
        'taskEngine@trustgrid.internal',
        { Status: task.Status },
        { Status: 'Overdue' }
      ).catch(e => console.error(e));
      return updated;
    }
    return task;
  });

  return evaluated;
}
