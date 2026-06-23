import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getEmailTemplates, saveEmailTemplate, getEmailTemplate } from '../services/emailTemplateStorage';
import { logger } from '../utils/logger';

/**
 * GET /api/email/templates
 * Get all email templates
 */
export async function getEmailTemplatesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const templates = await getEmailTemplates();
    res.json(templates);
  } catch (err) {
    logger.error('Error getting email templates:', err);
    res.status(500).json({ error: 'Failed to get email templates' });
  }
}

/**
 * POST /api/email/templates
 * Save an email template
 */
export async function saveEmailTemplateHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { templateName, subject, body } = req.body;

    if (!templateName || !subject || !body) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const success = await saveEmailTemplate({
      templateName,
      subject,
      body,
      updatedAt: new Date().toISOString(),
    });

    if (success) {
      res.json({
        success: true,
        message: 'Email template saved successfully',
      });
    } else {
      res.status(500).json({ error: 'Failed to save email template' });
    }
  } catch (err) {
    logger.error('Error saving email template:', err);
    res.status(500).json({ error: 'Failed to save email template' });
  }
}

/**
 * POST /api/email/templates/update
 * Update an email template body (for Admin Panel)
 */
export async function updateEmailTemplateHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { templateName, body } = req.body;

    if (!templateName || !body) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Get existing template to preserve subject (normalize name with template_ prefix if missing)
    const targetName = templateName.startsWith('template_') ? templateName : `template_${templateName}`;
    const existingTemplate = await getEmailTemplate(targetName);
    if (!existingTemplate) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const success = await saveEmailTemplate({
      templateName: targetName,
      subject: existingTemplate.subject,
      body,
      updatedAt: new Date().toISOString(),
    });

    if (success) {
      res.json({
        success: true,
        message: 'Email template updated successfully',
      });
    } else {
      res.status(500).json({ error: 'Failed to update email template' });
    }
  } catch (err) {
    logger.error('Error updating email template:', err);
    res.status(500).json({ error: 'Failed to update email template' });
  }
}
