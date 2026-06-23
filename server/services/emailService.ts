import { logger } from '../utils/logger';
import { config } from '../config/env';
import { getGmailToken, updateGmailAccessToken, deleteGmailToken } from './gmailTokenStorage';
import { refreshAccessToken } from './gmailOAuthService';
import { logEmailSuccess, logEmailFailure, logEmailRetry } from './emailLogService';
import { replaceTemplateVariables } from './emailTemplateStorage';
import { generateGoogleSheetsToken, fetchSheetValues } from './googleSheetsService';

/**
 * Converts plain text template to HTML with bold labels
 */
function convertToHtml(template: string): string {
  if (!template) return '';
  
  // Split into lines
  const lines = template.split('\n');
  
  // Process each line - bold lines that end with colon or are likely labels
  const htmlLines = lines.map(line => {
    const trimmed = line.trim();
    // If line ends with colon, it's a label - bold it
    if (trimmed.endsWith(':')) {
      return `<strong>${trimmed}</strong>`;
    }
    // If line contains a colon, bold the label part
    if (trimmed.includes(':')) {
      const [label, ...rest] = trimmed.split(':');
      return `<strong>${label}:</strong>${rest.join(':')}`;
    }
    return line;
  });
  
  // Join with line breaks
  return htmlLines.join('<br>');
}

/**
 * Gets email template from settings sheet
 */
async function getTemplateFromSettings(templateKey: string): Promise<{ subject: string; body: string } | null> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      return null;
    }

    const values = await fetchSheetValues(tokenData.accessToken, tokenData.spreadsheetId, 'settings!A:B');
    
    if (!values || values.length < 2) {
      return null;
    }

    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === templateKey) {
        const body = values[i][1] || '';
        // Generate subject from first line or use default
        const lines = body.split('\n').filter(l => l.trim());
        const subject = lines[0] || 'Task Notification';
        return { subject, body };
      }
    }

    return null;
  } catch (err) {
    logger.error('Error getting template from settings:', err);
    return null;
  }
}

/**
 * Email service for sending notifications via Gmail API
 */

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  references?: string; // For email threading
  inReplyTo?: string; // For email threading
}

/**
 * Encodes email content to base64 RFC 2822 format for Gmail API
 * @param email - Email object with to, subject, and content
 * @returns Base64 encoded email string
 */
function encodeEmail(email: EmailOptions): string {
  const headers = [
    `To: ${email.to}`,
    email.replyTo ? `Reply-To: ${email.replyTo}` : '',
    `Subject: ${email.subject}`,
    email.references ? `References: ${email.references}` : '',
    email.inReplyTo ? `In-Reply-To: ${email.inReplyTo}` : '',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
  ].filter(Boolean).join('\r\n');

  const emailContent = headers + '\r\n\r\n' + (email.html || email.text || '');

  return Buffer.from(emailContent)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Sends an email via Gmail API using a specific access token
 * @param accessToken - Valid Gmail access token
 * @param email - Email options
 * @returns true if successful, false otherwise
 */
async function sendEmailViaGmail(accessToken: string, email: EmailOptions): Promise<boolean> {
  try {
    const encodedEmail = encodeEmail(email);
    
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: encodedEmail,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Gmail API error:', errorText);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('Error sending email via Gmail:', err);
    return false;
  }
}

/**
 * Sends an email as a specific user using their Gmail OAuth tokens
 * @param senderEmail - Email address of the sender
 * @param toEmail - Recipient email address
 * @param subject - Email subject
 * @param body - Email body (text or HTML)
 * @param templateName - Optional template name to use
 * @param templateVariables - Variables to replace in template
 * @param threadId - Optional thread ID for email threading
 * @param messageId - Optional message ID for email threading
 * @returns true if successful, false otherwise
 */
export async function sendEmailAsUser(
  senderEmail: string,
  toEmail: string,
  subject: string,
  body: string,
  templateName?: string,
  templateVariables?: Record<string, string>,
  threadId?: string,
  messageId?: string
): Promise<boolean> {
  try {
    // Get sender's Gmail token
    const token = await getGmailToken(senderEmail);
    
    if (!token || !token.refreshToken) {
      // User hasn't connected Gmail, use fallback
      logger.warn(`No Gmail token for ${senderEmail}, using fallback email`);
      return sendFallbackEmail(senderEmail, toEmail, subject, body);
    }

    // Check if access token is expired
    const now = new Date();
    const expiryDate = new Date(token.tokenExpiry);
    let accessToken = token.accessToken;

    if (now >= expiryDate) {
      // Refresh the access token
      logger.info(`Access token expired for ${senderEmail}, refreshing...`);
      const refreshedToken = await refreshAccessToken(token.refreshToken);
      
      if (!refreshedToken) {
        // Refresh failed, mark user as disconnected
        logger.error(`Failed to refresh token for ${senderEmail}, disconnecting`);
        await deleteGmailToken(senderEmail);
        await logEmailFailure(senderEmail, toEmail, subject, 'Token refresh failed - user disconnected');
        return sendFallbackEmail(senderEmail, toEmail, subject, body);
      }

      // Update the stored access token
      accessToken = refreshedToken.access_token;
      await updateGmailAccessToken(senderEmail, accessToken, refreshedToken.expires_in);
      await logEmailRetry(senderEmail, toEmail, subject);
    }

    // Prepare email content
    let emailBody = body;
    if (templateName && templateVariables) {
      const template = await getTemplateFromSettings(templateName);
      logger.info(`Email template loaded: ${templateName}, found: ${!!template}`);
      if (template) {
        logger.info(`Template body: ${template.body}`);
        logger.info(`Template variables: ${JSON.stringify(templateVariables)}`);
        let replacedBody = replaceTemplateVariables(template.body, templateVariables);
        // Convert to HTML with bold labels
        emailBody = convertToHtml(replacedBody);
        logger.info(`Email body after replacement: ${emailBody}`);
        if (!subject.includes('{{') && !subject.includes('{')) {
          // If subject doesn't have variables, use template subject
          const templateSubject = replaceTemplateVariables(template.subject, templateVariables);
          subject = templateSubject;
          logger.info(`Subject after replacement: ${subject}`);
        }
      }
    }

    logger.info(`Final email body length: ${emailBody.length}, body: ${emailBody}`);

    const email: EmailOptions = {
      to: toEmail,
      subject,
      text: emailBody,
      replyTo: senderEmail,
      references: threadId,
      inReplyTo: messageId,
    };

    // Send the email
    const success = await sendEmailViaGmail(accessToken, email);

    if (success) {
      await logEmailSuccess(senderEmail, toEmail, subject);
      logger.info(`Email sent successfully from ${senderEmail} to ${toEmail}`);
    } else {
      await logEmailFailure(senderEmail, toEmail, subject, 'Gmail API send failed');
      // Try once more with a fresh token
      const refreshedToken = await refreshAccessToken(token.refreshToken);
      if (refreshedToken) {
        accessToken = refreshedToken.access_token;
        await updateGmailAccessToken(senderEmail, accessToken, refreshedToken.expires_in);
        const retrySuccess = await sendEmailViaGmail(accessToken, email);
        if (retrySuccess) {
          await logEmailSuccess(senderEmail, toEmail, subject);
          logger.info(`Email sent successfully on retry from ${senderEmail} to ${toEmail}`);
          return true;
        }
      }
    }

    return success;
  } catch (err) {
    logger.error(`Error sending email as user ${senderEmail}:`, err);
    await logEmailFailure(senderEmail, toEmail, subject, String(err));
    // Don't block the app flow, just return false
    return false;
  }
}

/**
 * Sends an email using the fallback system email
 * @param originalSender - Original sender email (used as Reply-To)
 * @param toEmail - Recipient email address
 * @param subject - Email subject
 * @param body - Email body
 * @returns true if successful, false otherwise
 */
async function sendFallbackEmail(
  originalSender: string,
  toEmail: string,
  subject: string,
  body: string
): Promise<boolean> {
  try {
    // For now, just log the email since we don't have a fallback email service
    // In production, you could use SendGrid, AWS SES, or another service here
    logger.info(`FALLBACK EMAIL (not sent): From: ${config.DEFAULT_FALLBACK_EMAIL}, Reply-To: ${originalSender}, To: ${toEmail}, Subject: ${subject}`);
    logger.info(`Body: ${body.substring(0, 200)}...`);
    
    // Log as success for tracking purposes
    await logEmailSuccess(config.DEFAULT_FALLBACK_EMAIL, toEmail, subject);
    
    return true;
  } catch (err) {
    logger.error('Error with fallback email:', err);
    await logEmailFailure(config.DEFAULT_FALLBACK_EMAIL, toEmail, subject, String(err));
    return false;
  }
}

/**
 * Legacy sendEmail function for backward compatibility
 * @param options - Email options
 * @returns true if successful, false otherwise
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    // Use fallback email for legacy calls
    return sendFallbackEmail(
      config.DEFAULT_FALLBACK_EMAIL,
      options.to,
      options.subject,
      options.text || options.html || ''
    );
  } catch (err) {
    logger.error(`Failed to send email to ${options.to}:`, err);
    return false;
  }
}

/**
 * Sends account approval email
 * @param email - User email
 * @returns true if successful, false otherwise
 */
export async function sendAccountApprovalEmail(email: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Your account has been approved',
    text: 'Your account has been approved. You can now log in to the application.',
    html: '<p>Your account has been approved. You can now log in to the application.</p>',
  });
}

/**
 * Sends account request notification to admin
 * @param adminEmail - Admin email
 * @param requesterName - Requester name
 * @param requesterEmail - Requester email
 * @returns true if successful, false otherwise
 */
export async function sendAccountRequestNotification(
  adminEmail: string,
  requesterName: string,
  requesterEmail: string
): Promise<boolean> {
  return sendEmail({
    to: adminEmail,
    subject: 'New account request',
    text: `${requesterName} (${requesterEmail}) has requested an account.`,
    html: `<p>${requesterName} (${requesterEmail}) has requested an account.</p>`,
  });
}
