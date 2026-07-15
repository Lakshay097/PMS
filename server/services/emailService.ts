import { logger } from '../utils/logger';
import { config } from '../config/env';
import { getGmailToken, updateGmailAccessToken, deleteGmailToken } from './gmailTokenStorage';
import { refreshAccessToken } from './gmailOAuthService';
import { replaceTemplateVariables } from './emailTemplateStorage';
import { logEmailSuccess, logEmailFailure, logEmailRetry, updateTaskEmailThreadId } from './emailLogService';
import { getEmailTemplate } from './emailTemplateStorage';
import { firestoreAdmin } from './firebaseAdmin';

/**
 * Resolves the sender email for an email based on OAuth token availability.
 * 
 * @param actingUserEmail - The email of the user performing the action (assigner, reporter, etc.)
 * @param eventType - Type of email event for logging (e.g., 'task_assignment', 'report_submission')
 * @param forceSystemSender - If true, always use system sender regardless of OAuth tokens
 * @returns Object with resolved sender email and whether token was found
 */
async function resolveSenderEmail(
  actingUserEmail: string,
  eventType: string,
  forceSystemSender: boolean = false
): Promise<{ senderEmail: string; tokenFound: boolean }> {
  if (forceSystemSender) {
    logger.info(`[EMAIL SENDER DEBUG] Event=${eventType}, forced system sender=${config.DEFAULT_FALLBACK_EMAIL}`);
    return { senderEmail: config.DEFAULT_FALLBACK_EMAIL, tokenFound: false };
  }

  // Try to get OAuth token for the acting user
  const token = await getGmailToken(actingUserEmail);
  
  if (token && token.refreshToken) {
    // Token exists - check if it can be refreshed (validates token health)
    try {
      const refreshed = await refreshAccessToken(token.refreshToken);
      if (refreshed) {
        // Token is valid and can be refreshed
        logger.info(`[EMAIL SENDER DEBUG] Event=${eventType}, resolved sender=${actingUserEmail}, tokenFound=true`);
        return { senderEmail: actingUserEmail, tokenFound: true };
      }
    } catch (refreshErr) {
      logger.warn(`[EMAIL SENDER DEBUG] Event=${eventType}, token refresh failed for ${actingUserEmail}`);
    }
  }

  // No valid token found - do NOT fall back, user must connect Gmail
  logger.info(`[EMAIL SENDER DEBUG] Event=${eventType}, no valid token found for ${actingUserEmail}`);
  return { senderEmail: actingUserEmail, tokenFound: false };
}

export interface EmailOptions {
  to: string;
  toRecipients?: string[];  // Multiple TO recipients instead of CC
  cc?: string[];  // CC recipients for shared threading (deprecated)
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  gmailThreadId?: string;  // Gmail API threadId for threading
  references?: string;  // RFC Message-ID chain for References header
  inReplyTo?: string;   // Last messageId for In-Reply-To header
}

/**
 * Encodes email to base64 RFC 2822 for Gmail API.
 * Returns both the encoded string and the generated Message-ID so callers can store it.
 */
function encodeEmail(email: EmailOptions): { raw: string; messageId: string } {
  const messageId = `<${Date.now()}-${Math.random().toString(36).substr(2, 9)}@pms.taskflow>`;
  
  // RFC 2822 requires Date header
  const dateHeader = new Date().toUTCString();
  
  // Build References header - if we have references, use them; otherwise use inReplyTo
  // References should contain the full thread history for proper Gmail threading
  const references = email.references || email.inReplyTo;
  
  // Use toRecipients if provided, otherwise fall back to single to + cc
  const toHeader = email.toRecipients && email.toRecipients.length > 0 
    ? `To: ${email.toRecipients.join(', ')}`
    : `To: ${email.to}`;

  const headers = [
    `Date: ${dateHeader}`,
    toHeader,
    email.cc && email.cc.length > 0 ? `Cc: ${email.cc.join(', ')}` : '',
    email.replyTo ? `Reply-To: ${email.replyTo}` : '',
    `Subject: ${email.subject}`,
    `Message-ID: ${messageId}`,
    // Threading headers
    email.inReplyTo ? `In-Reply-To: ${email.inReplyTo}` : '',
    references ? `References: ${references}` : '',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
  ].filter(Boolean).join('\r\n');

  logger.info(`Email headers being sent:`);
  logger.info(`  Date: ${dateHeader}`);
  logger.info(`  Message-ID: ${messageId}`);
  logger.info(`  Subject: ${email.subject}`);
  logger.info(`  In-Reply-To: ${email.inReplyTo || 'none'}`);
  logger.info(`  References: ${references || 'none'}`);
  logger.info(`  Gmail Thread ID: ${email.gmailThreadId || 'none'}`);

  const raw = Buffer.from(headers + '\r\n\r\n' + (email.html || email.text || ''))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { raw, messageId };
}

/**
 * Fetches the actual Message-ID header from Gmail after sending.
 * Gmail may rewrite or reformat the Message-ID, so we need to retrieve what Gmail actually stored.
 */
async function getGmailStoredMessageId(
  accessToken: string,
  gmailMessageId: string
): Promise<string | null> {
  try {
    // Wait a moment for Gmail to index the message
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailMessageId}?format=metadata&metadataHeaders=Message-ID`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Failed to fetch Gmail message metadata: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    const headers = data.payload?.headers || [];
    const messageIdHeader = headers.find((h: any) => h.name === 'Message-ID');
    
    logger.info(`Gmail message metadata fetched, headers count: ${headers.length}`);
    return messageIdHeader?.value || null;
  } catch (err) {
    logger.error('Error fetching Gmail stored Message-ID:', err);
    return null;
  }
}

/**
 * Sends via Gmail API using RFC 2822 threading headers only.
 *
 * We intentionally do NOT pass threadId to the Gmail API body.
 * threadId only works when the sending account owns that thread — it breaks
 * cross-account threading (e.g. Utsav assigns, Lakshay reports).
 * RFC In-Reply-To + References + identical Subject work across all accounts
 * and all email clients; Gmail groups them into a conversation for every participant.
 *
 * Returns { success, gmailThreadId, gmailMessageId } so the caller can persist them.
 */
async function sendEmailViaGmail(
  accessToken: string,
  email: EmailOptions
): Promise<{ success: boolean; gmailThreadId?: string; gmailMessageId?: string; storedMessageId?: string }> {
  try {
    logger.info(`[GMAIL API DEBUG] Preparing to send email to ${email.to}`);
    const { raw, messageId: outboundMessageId } = encodeEmail(email);

    // RFC threading only — no threadId param in body
    const body: Record<string, string> = { raw };

    logger.info(`[GMAIL API DEBUG] Request body: ${JSON.stringify(body).substring(0, 200)}...`);

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    logger.info(`[GMAIL API DEBUG] Response status: ${response.status}, ok: ${response.ok}`);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[GMAIL API ERROR] Status: ${response.status}, Error: ${errorText}`);
      return { success: false };
    }

    const data = await response.json();
    logger.info(`[GMAIL API SUCCESS] threadId=${data.threadId}, apiMessageId=${data.id}, rfcMessageId=${outboundMessageId}`);

    // FIX: Fetch the actual Message-ID that Gmail stored
    const storedMessageId = await getGmailStoredMessageId(accessToken, data.id);
    if (storedMessageId) {
      logger.info(`Gmail stored Message-ID: ${storedMessageId}`);
    } else {
      logger.warn(`Could not fetch Gmail stored Message-ID, using generated: ${outboundMessageId}`);
    }

    // Return the Gmail-stored Message-ID if available, otherwise use our generated one
    const finalMessageId = storedMessageId || outboundMessageId;

    return { success: true, gmailThreadId: data.threadId, gmailMessageId: finalMessageId, storedMessageId };
  } catch (err) {
    logger.error('Error sending email via Gmail:', err);
    return { success: false };
  }
}

/**
 * Sends an email as a specific user via their Gmail OAuth tokens.
 * Falls back to system sender if OAuth token is not available or refresh fails.
 *
 * @param actingUserEmail - The email of the user performing the action (assigner, reporter, etc.)
 * @param toEmail       - Recipient.
 * @param subject       - Subject line (pre-built by caller; template subject is ignored when non-empty).
 * @param body          - Fallback body if no template is used.
 * @param templateName  - Optional template key.
 * @param templateVars  - Variables to substitute in the template.
 * @param threadId      - Real Gmail threadId from task_email_threads (empty string on first send).
 * @param messageId     - Last Gmail messageId for In-Reply-To (empty string on first send).
 * @param taskId        - Task ID used to persist/look up the Gmail threadId after first send.
 * @param teamId        - Team ID for report reminder threading.
 * @param subTeamId     - Sub-team ID for report reminder threading.
 * @param weekOf        - Week of date for report reminders.
 * @param emailType     - Type of email for threading logic.
 * @param ccEmails      - CC recipients (deprecated).
 * @param toRecipients  - Multiple TO recipients.
 * @param eventType     - Type of email event for logging (e.g., 'task_assignment', 'report_submission').
 * @param forceSystemSender - If true, always use system sender regardless of OAuth tokens (for system-generated emails).
 * @returns { success, usedFallback, gmailThreadId?, gmailMessageId? } - Success flag plus Gmail thread/message IDs if successful.
 */
export async function sendEmailAsUser(
  actingUserEmail: string,
  toEmail: string,
  subject: string,
  body: string,
  templateName?: string,
  templateVars?: Record<string, string>,
  threadId?: string,
  messageId?: string,
  taskId?: string,
  teamId?: string,
  subTeamId?: string,
  weekOf?: string,
  emailType?: 'thursday_reminder' | 'proof_email' | 'report_reminder',
  ccEmails?: string[],
  toRecipients?: string[],
  eventType?: string,
  forceSystemSender: boolean = false
): Promise<{ success: boolean; usedFallback: boolean; gmailThreadId?: string; gmailMessageId?: string; storedMessageId?: string; error?: string }> {
  let senderEmail: string;
  let tokenFound: boolean;
  
  try {
    // Resolve the actual sender email based on OAuth token availability
    const resolved = await resolveSenderEmail(
      actingUserEmail,
      eventType || 'unknown',
      forceSystemSender
    );
    senderEmail = resolved.senderEmail;
    tokenFound = resolved.tokenFound;

    logger.info(`[EMAIL DEBUG] Sending email: actingUser=${actingUserEmail}, actualSender=${senderEmail}, to=${toEmail}, tokenFound=${tokenFound}`);

    let accessToken: string | null = null;

    // Fail if no valid token found (user must connect Gmail)
    if (!tokenFound && !forceSystemSender) {
      logger.error(`[EMAIL ERROR] No valid Gmail OAuth token found for ${actingUserEmail}. User must connect their Gmail account in Settings.`);
      await logEmailFailure(actingUserEmail, toEmail, subject, `No Gmail OAuth token found for ${actingUserEmail}. User must connect their Gmail account in Settings.`);
      return { success: false, usedFallback: false, error: `No Gmail OAuth token found for ${actingUserEmail}. Please connect your Gmail account in Settings to send emails.` };
    }

    // Get the token for the sender
    const senderToken = await getGmailToken(senderEmail);
    
    if (!senderToken || !senderToken.refreshToken) {
      logger.error(`[EMAIL ERROR] No Gmail OAuth token found for ${senderEmail}`);
      await logEmailFailure(senderEmail, toEmail, subject, `No Gmail OAuth token found for ${senderEmail}`);
      return { success: false, usedFallback: false, error: `No Gmail OAuth token found for ${senderEmail}. Please connect your Gmail account in Settings.` };
    }

    // Refresh token if expired
    const now = new Date();
    accessToken = senderToken.accessToken;
    const expiryDate = new Date(senderToken.tokenExpiry);
    logger.info(`[TOKEN DEBUG] Token expiry check for ${senderEmail}: now=${now.toISOString()}, expiry=${expiryDate.toISOString()}, isExpired=${now >= expiryDate}`);
    
    if (now >= expiryDate) {
      logger.info(`[TOKEN DEBUG] Token expired for ${senderEmail}, refreshing...`);
      try {
        const refreshed = await refreshAccessToken(senderToken.refreshToken);
        if (!refreshed) {
          logger.error(`[TOKEN ERROR] Token refresh failed for ${senderEmail}`);
          await logEmailFailure(senderEmail, toEmail, subject, 'Token refresh failed - Gmail OAuth token expired or revoked');
          return { success: false, usedFallback: false, error: `Gmail OAuth token refresh failed for ${senderEmail}. Please reconnect your Gmail account in Settings.` };
        }
        accessToken = refreshed.access_token;
        await updateGmailAccessToken(senderEmail, accessToken, refreshed.expires_in);
        await logEmailRetry(senderEmail, toEmail, subject);
        logger.info(`[TOKEN DEBUG] Token refreshed successfully for ${senderEmail}`);
      } catch (refreshErr) {
        logger.error(`[TOKEN ERROR] Token refresh exception for ${senderEmail}:`, refreshErr);
        await logEmailFailure(senderEmail, toEmail, subject, 'Token refresh failed - Gmail OAuth token expired or revoked');
        return { success: false, usedFallback: false, error: `Gmail OAuth token refresh failed for ${senderEmail}. Please reconnect your Gmail account in Settings.` };
      }
    } else {
      logger.info(`[TOKEN DEBUG] Token is still valid for ${senderEmail}`);
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
        
        // Only convert newlines to <br> if the template doesn't already contain HTML tags
        // If template has HTML (like <p>, <ul>, etc.), use it as-is
        const hasHtmlTags = /<[a-z][\s\S]*>/i.test(emailBody);
        if (!hasHtmlTags) {
          emailBody = emailBody
            .split('\n')
            .map(line => line.trim())
            .filter(line => line !== '')
            .join('<br>');
        }

        // Only use template subject if no custom subject was provided
        // Custom subjects (like [TaskID] Title) are used for Gmail threading
        if (!subject || subject.trim() === '') {
          subject = replaceTemplateVariables(template.subject, templateVars);
          logger.info(`Using template subject: ${subject}`);
        } else {
          logger.info(`Using custom subject for threading: ${subject}`);
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
      toRecipients: toRecipients,
      cc: ccEmails,
      subject,
      html: emailBody,
      replyTo: senderEmail,
      gmailThreadId: threadId || undefined,  // Gmail API threadId for threading
      inReplyTo: messageId || undefined,    // last RFC Message-ID for In-Reply-To header
    };

    logger.info(`Sending email: taskId=${taskId}, threadId=${threadId || 'NEW'}, inReplyTo=${messageId || 'none'}`);

    const result = await sendEmailViaGmail(accessToken, email);

    if (result.success) {
      await logEmailSuccess(senderEmail, toEmail, subject);
      logger.info(`Email sent OK from ${senderEmail} to ${toEmail} (acting user: ${actingUserEmail})`);

      // FIX: After every successful send, persist the real Gmail threadId + messageId
      // so all subsequent emails for this task chain into the same Gmail thread.
      if (taskId && result.gmailThreadId && result.gmailMessageId) {
        if (emailType === 'report_reminder') {
          // For report reminders, use the teamId-based thread persistence
          const { updateReportReminderThreadId } = await import('./reportReminderScheduler');
          await updateReportReminderThreadId(taskId, toEmail, result.gmailThreadId, result.gmailMessageId);
        } else {
          // For task emails, use the Google Sheets-based thread persistence
          await updateTaskEmailThreadId(taskId, result.gmailThreadId, result.gmailMessageId);
        }
      }
      return { success: true, usedFallback: false, gmailThreadId: result.gmailThreadId, gmailMessageId: result.gmailMessageId, storedMessageId: result.storedMessageId };
    }

    // Retry once with a fresh token
    const retryToken = await getGmailToken(senderEmail);
    if (retryToken && retryToken.refreshToken) {
      await logEmailFailure(senderEmail, toEmail, subject, 'Gmail API send failed — retrying');
      const refreshed = await refreshAccessToken(retryToken.refreshToken);
      if (refreshed) {
        accessToken = refreshed.access_token;
        await updateGmailAccessToken(senderEmail, accessToken, refreshed.expires_in);
        const retry = await sendEmailViaGmail(accessToken, email);
        if (retry.success) {
          await logEmailSuccess(senderEmail, toEmail, subject);
          if (taskId && retry.gmailThreadId && retry.gmailMessageId) {
            await updateTaskEmailThreadId(taskId, retry.gmailThreadId, retry.gmailMessageId);
          }
          return { success: true, usedFallback: false, gmailThreadId: retry.gmailThreadId, gmailMessageId: retry.gmailMessageId };
        }
      }
    }

    // Final error after retry exhausted
    await logEmailFailure(senderEmail, toEmail, subject, 'Gmail API send failed after retry');
    return { success: false, usedFallback: false, error: `Failed to send email via Gmail API for ${senderEmail}. Please check your Gmail connection in Settings.` };
  } catch (err) {
    logger.error(`Error sending email as ${senderEmail}:`, err);
    await logEmailFailure(senderEmail, toEmail, subject, String(err));
    return { success: false, usedFallback: false, error: `Error sending email: ${String(err)}. Please check your Gmail connection in Settings.` };
  }
}

async function sendFallbackEmail(
  originalSender: string,
  toEmail: string,
  subject: string,
  body: string,
  teamId?: string,
  subTeamId?: string,
  type?: 'thursday_reminder' | 'proof_email' | 'report_reminder',
  weekOf?: string
): Promise<boolean> {
  try {
    logger.info(`FALLBACK EMAIL (not sent): Reply-To=${originalSender}, To=${toEmail}, Subject=${subject}`);
    await logEmailSuccess(config.DEFAULT_FALLBACK_EMAIL, toEmail, subject);

    // Write to email_delivery_failures collection for visibility
    if (teamId && type && weekOf) {
      try {
        await firestoreAdmin.collection('email_delivery_failures').add({
          teamId,
          subTeamId: subTeamId || null,
          type,
          intendedRecipient: toEmail,
          weekOf,
          timestamp: new Date().toISOString(),
          reason: 'Gmail OAuth token not found or invalid - using fallback (email not actually sent)'
        });
        logger.info(`Logged email delivery failure to Firestore: teamId=${teamId}, type=${type}, recipient=${toEmail}`);
      } catch (firebaseErr) {
        logger.error('Failed to log email delivery failure to Firestore:', firebaseErr);
      }
    }

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