import { generateGoogleSheetsToken, fetchSheetValues, appendSheetValues, updateSheetValues, createSheet } from './googleSheetsService';
import { logger } from '../utils/logger';

/**
 * Email template interface
 */
export interface EmailTemplate {
  templateName: string;
  subject: string;
  body: string;
  updatedAt: string;
}

/**
 * Default email templates
 */
export const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    templateName: 'template_assigned_email',
    subject: 'New task assigned: {Title}',
    body: 'Hello {AssignedToEmail},\n\nYou have been assigned a new task:\n\nTask: {Title}\nTask ID: {TaskID}\nDue Date: {DueDate}\nPriority: {Priority}\nAssigned by: {AssignedByEmail}\n\nDescription: {Description}\n\nPlease review and start working on this task.\n\nBest regards,\nPMS Team',
    updatedAt: new Date().toISOString(),
  },
  {
    templateName: 'template_delayed_email',
    subject: 'Task due in 24 hours: {Title}',
    body: 'Hello {AssignedToEmail},\n\nThe following task is due within 24 hours:\n\nTask: {Title}\nTask ID: {TaskID}\nDue Date: {DueDate}\nPriority: {Priority}\n\nPlease ensure you complete this task on time.\n\nBest regards,\nPMS Team',
    updatedAt: new Date().toISOString(),
  },
];

/**
 * Initializes the email_templates sheet if it doesn't exist
 */
export async function initializeEmailTemplatesSheet(): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('Failed to get Google Sheets token for initialization');
      return false;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    
    // Check if email_templates sheet exists
    const existingValues = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates!A1:D1');
    
    if (existingValues && existingValues.length > 0) {
      // Sheet already exists with headers
      return true;
    }

    // Create the sheet first
    await createSheet(tokenData.accessToken, spreadsheetId, 'email_templates');

    // Create the sheet with headers and default templates
    const headers = [
      ['template_name', 'subject', 'body', 'updated_at']
    ];

    const success = await appendSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates', headers);
    
    if (!success) {
      logger.error('Failed to create email_templates headers');
      return false;
    }

    // Add default templates
    for (const template of DEFAULT_TEMPLATES) {
      const row = [
        template.templateName,
        template.subject,
        template.body,
        template.updatedAt,
      ];
      await appendSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates', [row]);
    }

    logger.info('Initialized email_templates sheet with default templates');
    return true;
  } catch (err) {
    logger.error('Error initializing email_templates sheet:', err);
    return false;
  }
}

/**
 * Retrieves all email templates
 */
export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('Failed to get Google Sheets token');
      return [];
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const values = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates!A:D');

    if (!values || values.length < 2) {
      return DEFAULT_TEMPLATES;
    }

    const templates: EmailTemplate[] = [];

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (row[0]) {
        templates.push({
          templateName: row[0],
          subject: row[1] || '',
          body: row[2] || '',
          updatedAt: row[3] || new Date().toISOString(),
        });
      }
    }

    return templates;
  } catch (err) {
    logger.error('Error getting email templates:', err);
    return DEFAULT_TEMPLATES;
  }
}

/**
 * Retrieves a specific email template by name
 */
export async function getEmailTemplate(templateName: string): Promise<EmailTemplate | null> {
  const templates = await getEmailTemplates();
  let template = templates.find(t => t.templateName === templateName);
  
  if (!template) {
    // Check aliases
    if (templateName === 'task_due_soon' || templateName === 'task_overdue') {
      template = templates.find(t => t.templateName === 'template_delayed_email');
    }
  }
  
  // If still not found, check DEFAULT_TEMPLATES
  if (!template) {
    template = DEFAULT_TEMPLATES.find(t => t.templateName === templateName);
  }
  
  // If still not found, try fallback aliases in DEFAULT_TEMPLATES
  if (!template && (templateName === 'task_due_soon' || templateName === 'task_overdue')) {
    template = DEFAULT_TEMPLATES.find(t => t.templateName === 'template_delayed_email');
  }
  
  return template || null;
}

/**
 * Saves or updates an email template
 */
export async function saveEmailTemplate(template: EmailTemplate): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('Failed to get Google Sheets token');
      return false;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const values = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates!A:D');

    if (!values) {
      return false;
    }

    const now = new Date().toISOString();
    const updatedTemplate = { ...template, updatedAt: now };

    // Check if template already exists
    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === template.templateName) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex > 0) {
      // Update existing row
      const updatedRow = [
        template.templateName,
        template.subject,
        template.body,
        now,
      ];

      const success = await updateSheetValues(
        tokenData.accessToken,
        spreadsheetId,
        `email_templates!A${rowIndex + 1}:D${rowIndex + 1}`,
        [updatedRow]
      );

      if (success) {
        logger.info(`Updated email template: ${template.templateName}`);
      }

      return success;
    } else {
      // Append new row
      const newRow = [
        template.templateName,
        template.subject,
        template.body,
        now,
      ];

      const success = await appendSheetValues(tokenData.accessToken, spreadsheetId, 'email_templates', [newRow]);

      if (success) {
        logger.info(`Saved new email template: ${template.templateName}`);
      }

      return success;
    }
  } catch (err) {
    logger.error('Error saving email template:', err);
    return false;
  }
}

/**
 * Replaces template variables with actual values
 */
export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  if (!result) return '';

  const expandedVars: Record<string, string> = { ...variables };
  
  const mappings: Record<string, string[]> = {
    'Title': ['task_name', 'Title'],
    'TaskID': ['task_id', 'TaskID'],
    'Description': ['description', 'Description', 'task_description', 'TaskDescription'],
    'Priority': ['priority', 'Priority'],
    'DueDate': ['due_date', 'DueDate'],
    'AssignedToEmail': ['assigned_to', 'AssignedToEmail'],
    'AssignedByEmail': ['assigned_by', 'AssignedByEmail'],
    'ReportContent': ['report_content', 'ReportContent'],
    'AppUrl': ['app_url', 'AppUrl', 'AppURL']
  };

  for (const [standardKey, aliasKeys] of Object.entries(mappings)) {
    let foundValue = '';
    for (const key of aliasKeys) {
      if (variables[key] !== undefined) {
        foundValue = variables[key];
        break;
      }
    }
    if (foundValue) {
      expandedVars[standardKey] = foundValue;
      for (const key of aliasKeys) {
        expandedVars[key] = foundValue;
      }
    }
  }

  for (const [key, value] of Object.entries(expandedVars)) {
    const val = value || '';
    result = result.split(`{${key}}`).join(val);
    result = result.split(`{{${key}}}`).join(val);
  }

  return result;
}
