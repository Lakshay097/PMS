import { logger } from '../utils/logger';
import { config } from '../config/env';
import { getGmailToken, updateGmailAccessToken, deleteGmailToken } from './gmailTokenStorage';
import { refreshAccessToken } from './gmailOAuthService';
import { replaceTemplateVariables } from './emailTemplateStorage';
import { logEmailSuccess, logEmailFailure, logEmailRetry, updateTaskEmailThreadId } from './emailLogService';
import { getEmailTemplate } from './emailTemplateStorage';

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  references?: string;  // Gmail threadId for threading
  inReplyTo?: string;   // Last messageId for In-Reply-To header
}

/**
 * Encodes email to base64 RFC 2822 for Gmail API.
 * Returns both the encoded string and the generated Message-ID so callers can store it.
 */
function encodeEmail(email: EmailOptions): { raw: string; messageId: string } {
  const messageId = `<${Date.now()}-${Math.random().toString(36).substr(2, 9)}@pms.taskflow>`;
  const headers = [
    `To: ${email.to}`,
    email.replyTo ? `Reply-To: ${email.replyTo}` : '',
    `Subject: ${email.subject}`,
    `Message-ID: ${messageId}`,
    // Threading headers — always set when we have a prior messageId
    email.inReplyTo ? `In-Reply-To: ${email.inReplyTo}` : '',
    email.inReplyTo ? `References: ${email.inReplyTo}` : '',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
  ].filter(Boolean).join('\r\n');

  const raw = Buffer.from(headers + '\r\n\r\n' + (email.html || email.text || ''))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { raw, messageId };
}

/**
 * Sends via Gmail API.
 * FIX: Always pass threadId to Gmail when we have a real one (non-empty, not a placeholder).
 * Returns { success, gmailThreadId, gmailMessageId } so the caller can persist them.
 */
async function sendEmailViaGmail(
  accessToken: string,
  email: EmailOptions
): Promise<{ success: boolean; gmailThreadId?: string; gmailMessageId?: string }> {
  try {
    const { raw, messageId: outboundMessageId } = encodeEmail(email);

    // FIX: Include threadId in the Gmail API body whenever we have a real Gmail threadId.
    // A real threadId is non-empty and does NOT contain '@pms.taskflow' (our placeholder format).
    const hasRealThreadId = email.references && !email.references.includes('@pms.taskflow') && email.references.trim() !== '';

    const body: Record<string, string> = { raw };
    if (hasRealThreadId) {
      body.threadId = email.references!;
    }

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Gmail API error:', errorText);
      return { success: false };
    }

    const data = await response.json();
    logger.info(`Gmail send OK: threadId=${data.threadId}, messageId=${data.id}`);
    return { success: true, gmailThreadId: data.threadId, gmailMessageId: data.id };
  } catch (err) {
    logger.error('Error sending email via Gmail:', err);
    return { success: false };
  }
}

/**
 * Sends an email as a specific user via their Gmail OAuth tokens.
 *
 * @param taskId        - Task ID used to persist/look up the Gmail threadId after first send.
 * @param senderEmail   - OAuth-connected sender.
 * @param toEmail       - Recipient.
 * @param subject       - Subject line (pre-built by caller; template subject is ignored when non-empty).
 * @param body          - Fallback body if no template is used.
 * @param templateName  - Optional template key.
 * @param templateVars  - Variables to substitute in the template.
 * @param threadId      - Real Gmail threadId from task_email_threads (empty string on first send).
 * @param messageId     - Last Gmail messageId for In-Reply-To (empty string on first send).
 */
export async function sendEmailAsUser(
  senderEmail: string,
  toEmail: string,
  subject: string,
  body: string,
  templateName?: string,
  templateVars?: Record<string, string>,
  threadId?: string,
  messageId?: string,
  taskId?: string
): Promise<boolean> {
  try {
    const token = await getGmailToken(senderEmail);

    if (!token || !token.refreshToken) {
      logger.warn(`No Gmail token for ${senderEmail}, using fallback`);
      return sendFallbackEmail(senderEmail, toEmail, subject, body);
    }

    // Refresh token if expired
    const now = new Date();
    let accessToken = token.accessToken;
    if (now >= new Date(token.tokenExpiry)) {
      logger.info(`Token expired for ${senderEmail}, refreshing...`);
      const refreshed = await refreshAccessToken(token.refreshToken);
      if (!refreshed) {
        logger.error(`Token refresh failed for ${senderEmail}, disconnecting`);
        await deleteGmailToken(senderEmail);
        await logEmailFailure(senderEmail, toEmail, subject, 'Token refresh failed');
        return sendFallbackEmail(senderEmail, toEmail, subject, body);
      }
      accessToken = refreshed.access_token;
      await updateGmailAccessToken(senderEmail, accessToken, refreshed.expires_in);
      await logEmailRetry(senderEmail, toEmail, subject);
    }

    // Resolve template body
    let emailBody = body;
    if (templateName && templateVars) {
      const template = await getEmailTemplate(templateName);
      logger.info(`Template loaded: ${templateName}, found=${!!template}`);
      if (template) {
        logger.info(`Template body before replacement: ${template.body}`);
        logger.info(`Template variables: ${JSON.stringify(templateVars)}`);
        
        // FIX: Replace variables in body first, THEN convert newlines to <br>
        // (previously the join happened before replacement in some paths)
        emailBody = replaceTemplateVariables(template.body, templateVars);
        
        logger.info(`Template body after replacement: ${emailBody}`);
        
        emailBody = emailBody
          .split('\n')
          .map(line => line.trim())
          .filter(line => line !== '')
          .join('<br>');

        // Only override subject when caller didn't supply one
        if (!subject || subject.trim() === '') {
          const originalSubject = template.subject;
          subject = replaceTemplateVariables(template.subject, templateVars);
          logger.info(`Subject before: ${originalSubject}, after: ${subject}`);
        }

        // Warn if any placeholders remain unreplaced
        const unreplaced = [...emailBody.matchAll(/\{[^}]+\}/g)].map(m => m[0]);
        if (unreplaced.length > 0) {
          logger.warn(`Unreplaced template variables in ${templateName}: ${unreplaced.join(', ')}`);
        }
      }
    }

    const email: EmailOptions = {
      to: toEmail,
      subject,
      html: emailBody,
      replyTo: senderEmail,
      references: threadId || undefined,   // real Gmail threadId (empty = first send)
      inReplyTo: messageId || undefined,    // last Gmail messageId for In-Reply-To header
    };

    logger.info(`Sending email: taskId=${taskId}, threadId=${threadId || 'NEW'}, inReplyTo=${messageId || 'none'}`);

    const result = await sendEmailViaGmail(accessToken, email);

    if (result.success) {
      await logEmailSuccess(senderEmail, toEmail, subject);
      logger.info(`Email sent OK from ${senderEmail} to ${toEmail}`);

      // FIX: After every successful send, persist the real Gmail threadId + messageId
      // so all subsequent emails for this task chain into the same Gmail thread.
      if (taskId && result.gmailThreadId && result.gmailMessageId) {
        await updateTaskEmailThreadId(taskId, result.gmailThreadId, result.gmailMessageId);
      }
      return true;
    }

    // Retry once with a fresh token
    await logEmailFailure(senderEmail, toEmail, subject, 'Gmail API send failed — retrying');
    const refreshed = await refreshAccessToken(token.refreshToken);
    if (refreshed) {
      accessToken = refreshed.access_token;
      await updateGmailAccessToken(senderEmail, accessToken, refreshed.expires_in);
      const retry = await sendEmailViaGmail(accessToken, email);
      if (retry.success) {
        await logEmailSuccess(senderEmail, toEmail, subject);
        if (taskId && retry.gmailThreadId && retry.gmailMessageId) {
          await updateTaskEmailThreadId(taskId, retry.gmailThreadId, retry.gmailMessageId);
        }
        return true;
      }
    }

    return false;
  } catch (err) {
    logger.error(`Error sending email as ${senderEmail}:`, err);
    await logEmailFailure(senderEmail, toEmail, subject, String(err));
    return false;
  }
}

async function sendFallbackEmail(
  originalSender: string,
  toEmail: string,
  subject: string,
  body: string
): Promise<boolean> {
  try {
    logger.info(`FALLBACK EMAIL (not sent): Reply-To=${originalSender}, To=${toEmail}, Subject=${subject}`);
    await logEmailSuccess(config.DEFAULT_FALLBACK_EMAIL, toEmail, subject);
    return true;
  } catch (err) {
    logger.error('Fallback email error:', err);
    await logEmailFailure(config.DEFAULT_FALLBACK_EMAIL, toEmail, subject, String(err));
    return false;
  }
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  return sendFallbackEmail(config.DEFAULT_FALLBACK_EMAIL, options.to, options.subject, options.text || options.html || '');
}

export async function sendAccountApprovalEmail(email: string): Promise<boolean> {
  return sendEmail({ to: email, subject: 'Your account has been approved', text: 'Your account has been approved. You can now log in.' });
}

export async function sendAccountRequestNotification(adminEmail: string, requesterName: string, requesterEmail: string): Promise<boolean> {
  return sendEmail({ to: adminEmail, subject: 'New account request', text: `${requesterName} (${requesterEmail}) has requested an account.` });
}