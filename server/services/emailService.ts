import { logger } from '../utils/logger';

/**
 * Email service for sending notifications
 * Currently a placeholder - implement with your email provider (SendGrid, AWS SES, etc.)
 */

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

/**
 * Sends an email
 * @param options - Email options
 * @returns true if successful, false otherwise
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    // TODO: Implement email sending logic
    // Example with SendGrid:
    // await sgMail.send({
    //   to: options.to,
    //   from: process.env.EMAIL_FROM,
    //   subject: options.subject,
    //   text: options.text,
    //   html: options.html,
    // });

    logger.info(`Email sent to ${options.to}: ${options.subject}`);
    return true;
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
