import { generateGoogleSheetsToken, fetchSheetValues, appendSheetValues, updateSheetValues, createSheet } from './googleSheetsService';
import { logger } from '../utils/logger';

export interface EmailTemplate {
  templateName: string;
  subject: string;
  body: string;
  updatedAt: string;
}

export const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    templateName: 'template_assigned_email',
    subject: 'New task assigned: {Title}',
    body: 'Hi {AssignedToName},\n\nYou have been assigned a new task:\n\nTask: {Title}\nTask ID: {TaskID}\nDue Date: {DueDate}\nPriority: {Priority}\nAssigned by: {AssignedByEmail}\n\nDescription: {Description}\n\nPlease review and start working on this task.\n\nBest regards,\n{AssignedByName}',
    updatedAt: new Date().toISOString(),
  },
  {
    templateName: 'template_delayed_email',
    subject: 'Task due in 24 hours: {Title}',
    body: 'Hi {AssignedToName},\n\nThe following task is due within 24 hours:\n\nTask: {Title}\nTask ID: {TaskID}\nDue Date: {DueDate}\nPriority: {Priority}\n\nPlease ensure you complete this task on time.\n\nBest regards,\n{AssignedByName}',
    updatedAt: new Date().toISOString(),
  },
  {
    templateName: 'report_submitted',
    subject: 'Progress Report: {task_name} [{task_id}]',
    body: 'Hi {AllocatorName},\n\nA progress report has been submitted for the following task:\n\nTask: {task_name}\nTask ID: {task_id}\nSubmitted By: {SubmittedByName}\n\nReport Content:\n{report_content}\n\nBest regards,\n{SubmittedByName}',
    updatedAt: new Date().toISOString(),
  },
  {
    templateName: 'task_closed',
    subject: 'Task Closed: {task_name} [{task_id}]',
    body: 'Hi {AssignedToName},\n\nThe following task has been marked as closed:\n\nTask: {task_name}\nTask ID: {task_id}\nClosed By: {ClosedByName}\nCompletion Date: {completion_date}\n\nClose Remarks:\n{close_remark}\n\nBest regards,\n{ClosedByName}',
    updatedAt: new Date().toISOString(),
  },
  {
    templateName: 'template_scheduled_reminder',
    subject: 'Weekly Report Reminder: Submit PPT by Friday for {TeamName}',
    body: 'Hello,\n\nThis is a reminder for team leaders of team "{TeamName}" to submit the weekly PPT report by Friday.\n\nPlease log in and upload your PPT:\n\nApp URL: <a href="{AppURL}" style="color: #3b82f6; text-decoration: underline;">{AppURL}</a>\n\nBest regards,\nPMS Team',
    updatedAt: new Date().toISOString(),
  },
  {
    templateName: 'template_proof_email',
    subject: 'Weekly Report Proof: {DisplayName}',
    body: 'Weekly report proof of submission for {DisplayName}\n\nSubmitted by: {SubmittedBy}\nSubmitted at: {SubmittedAt}\n\n{NoteSection}{AttachmentsSection}',
    updatedAt: new Date().toISOString(),
  },
];

export async function initializeEmailTemplatesSheet(): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) return false;

    const spreadsheetId = tokenData.spreadsheetId;
    const existingValues = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates!A1:D1');
    if (existingValues && existingValues.length > 0) return true;

    await createSheet(tokenData.accessToken, spreadsheetId, 'email_templates');
    await appendSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates', [['template_name', 'subject', 'body', 'updated_at']]);

    for (const template of DEFAULT_TEMPLATES) {
      await appendSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates', [
        [template.templateName, template.subject, template.body, template.updatedAt],
      ]);
    }

    logger.info('Initialized email_templates sheet with default templates');
    return true;
  } catch (err) {
    logger.error('Error initializing email_templates sheet:', err);
    return false;
  }
}

export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) return DEFAULT_TEMPLATES;

    const values = await fetchSheetValues(tokenData.accessToken, tokenData.spreadsheetId, 'email_templates!A:D');
    if (!values || values.length < 2) return DEFAULT_TEMPLATES;

    const templates: EmailTemplate[] = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (row[0]) {
        templates.push({ templateName: row[0], subject: row[1] || '', body: row[2] || '', updatedAt: row[3] || new Date().toISOString() });
      }
    }

    for (const def of DEFAULT_TEMPLATES) {
      if (!templates.find(t => t.templateName === def.templateName)) {
        templates.push(def);
      }
    }

    return templates;
  } catch (err) {
    logger.error('Error getting email templates:', err);
    return DEFAULT_TEMPLATES;
  }
}

export async function getEmailTemplate(templateName: string): Promise<EmailTemplate | null> {
  const templates = await getEmailTemplates();
  let template = templates.find(t => t.templateName === templateName);

  if (!template && (templateName === 'task_due_soon' || templateName === 'task_overdue')) {
    template = templates.find(t => t.templateName === 'template_delayed_email');
  }
  if (!template) {
    template = DEFAULT_TEMPLATES.find(t => t.templateName === templateName);
  }
  if (!template && (templateName === 'task_due_soon' || templateName === 'task_overdue')) {
    template = DEFAULT_TEMPLATES.find(t => t.templateName === 'template_delayed_email');
  }

  return template || null;
}

export async function saveEmailTemplate(template: EmailTemplate): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) return false;

    const spreadsheetId = tokenData.spreadsheetId;
    const values = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates!A:D');
    if (!values) return false;

    const now = new Date().toISOString();
    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === template.templateName) { rowIndex = i; break; }
    }

    const row = [template.templateName, template.subject, template.body, now];

    if (rowIndex > 0) {
      return updateSheetValues(tokenData.accessToken, spreadsheetId, `email_templates!A${rowIndex + 1}:D${rowIndex + 1}`, [row]);
    }
    return appendSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates', [row]);
  } catch (err) {
    logger.error('Error saving email template:', err);
    return false;
  }
}

/**
 * Reset a specific template to its default value
 */
export async function resetTemplateToDefault(templateName: string): Promise<boolean> {
  try {
    const defaultTemplate = DEFAULT_TEMPLATES.find(t => t.templateName === templateName);
    if (!defaultTemplate) {
      logger.error(`Template ${templateName} not found in defaults`);
      return false;
    }

    return await saveEmailTemplate({
      ...defaultTemplate,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Error resetting template to default:', err);
    return false;
  }
}

/**
 * Replaces {variable} placeholders in a template string.
 *
 * FIX — two improvements:
 * 1. Alias expansion runs first to unify snake_case ↔ PascalCase keys into expandedVars.
 * 2. Replacement is done in a deterministic order: longer keys first, so a key like
 *    {task_name} is never partially consumed by a shorter overlapping key.
 * 3. A final safety scan logs any remaining {placeholders} so they're visible in logs.
 */
export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  if (!template) return '';

  // Step 1: expand aliases so both snake_case and PascalCase keys are available
  const expandedVars: Record<string, string> = { ...variables };

  const mappings: Array<[string, string[]]> = [
    ['Title',           ['task_name', 'Title']],
    ['TaskID',          ['task_id', 'TaskID']],
    ['Description',     ['description', 'Description', 'task_description', 'TaskDescription']],
    ['Priority',        ['priority', 'Priority']],
    ['DueDate',         ['due_date', 'DueDate']],
    ['AssignedToEmail', ['assigned_to', 'AssignedToEmail']],
    ['AssignedByEmail', ['assigned_by', 'AssignedByEmail']],
    ['ReportContent',   ['report_content', 'ReportContent']],
    ['AppUrl',          ['app_url', 'AppUrl', 'AppURL']],
    ['close_remark',    ['close_remark', 'CloseRemark']],
    ['closed_by',       ['closed_by', 'ClosedBy']],
    ['completion_date', ['completion_date', 'CompletionDate']],
    ['report_content',  ['report_content', 'ReportContent']],
    ['task_name',       ['task_name', 'Title']],
    ['task_id',         ['task_id', 'TaskID']],
    ['due_date',        ['due_date', 'DueDate']],
    ['priority',        ['priority', 'Priority']],
    ['assigned_to',     ['assigned_to', 'AssignedToEmail']],
  ];

  for (const [standardKey, aliasKeys] of mappings) {
    let foundValue: string | undefined;
    for (const key of aliasKeys) {
      if (variables[key] !== undefined && variables[key] !== '') {
        foundValue = variables[key];
        break;
      }
    }
    if (foundValue !== undefined) {
      // Populate the standard key and all its aliases
      expandedVars[standardKey] = foundValue;
      for (const key of aliasKeys) {
        expandedVars[key] = foundValue;
      }
    }
  }

  // Step 2: replace in longest-key-first order to avoid partial matches
  // e.g. replace {AssignedByEmail} before {AssignedToEmail} or {assigned_to}
  let result = template;
  const sortedKeys = Object.keys(expandedVars).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    const val = expandedVars[key] ?? '';
    // Double-brace first, then single-brace
    result = result.split(`{{${key}}}`).join(val);
    result = result.split(`{${key}}`).join(val);
  }

  // Step 3: warn about any remaining placeholders
  const remaining = [...result.matchAll(/\{[^}]+\}/g)].map(m => m[0]);
  if (remaining.length > 0) {
    logger.warn(`replaceTemplateVariables: unreplaced placeholders: ${remaining.join(', ')}`);
  }

  return result;
}