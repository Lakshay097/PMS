import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { firestoreAdmin } from '../services/firebaseAdmin';
import { sendEmailAsUser } from '../services/emailService';
import { generateGoogleSheetsToken, fetchSheetValues } from '../services/googleSheetsService';
import { config } from '../config/env';
import { getEmailTemplate, replaceTemplateVariables } from '../services/emailTemplateStorage';

interface SendProofEmailRequest {
  teamId: string;
  subTeamId?: string;
  teamName: string;
  subTeamName?: string;
  leaderEmails: string[];
  attachmentLinks: string;
  note?: string;
  submittedBy: string;
}

/**
 * GET /api/team-reminder-thread/:teamId/:weekOf
 * Protected endpoint to fetch threadId/messageId for a team's weekly reminder
 */
export async function getTeamReminderThread(req: AuthRequest, res: Response): Promise<void> {
  const { teamId, weekOf } = req.params;

  logger.info(`Fetching team reminder thread: teamId=${teamId}, weekOf=${weekOf}`);

  try {
    const docId = `${teamId}_${weekOf}`;
    const doc = await firestoreAdmin.collection('teamReminderThreads').doc(docId).get();

    if (!doc.exists) {
      res.json({ threadId: null, messageId: null });
      return;
    }

    const data = doc.data();
    res.json({
      threadId: data?.gmailThreadId || null,
      messageId: data?.gmailMessageId || null,
      teamName: data?.teamName || null,
      subTeamId: data?.subTeamId || null,
      subTeamName: data?.subTeamName || null
    });
  } catch (error) {
    logger.error(`Error fetching team reminder thread: teamId=${teamId}, weekOf=${weekOf}`, error);
    res.status(500).json({ error: 'Failed to fetch team reminder thread' });
  }
}

/**
 * POST /api/send-proof-email
 * Protected endpoint to send proof email with attachment after team submission
 */
export async function sendProofEmail(req: AuthRequest, res: Response): Promise<void> {
  const { teamId, subTeamId, teamName, subTeamName, leaderEmails, attachmentLinks, note, submittedBy } = req.body as SendProofEmailRequest;

  logger.info(`Sending proof email: teamId=${teamId}, subTeamId=${subTeamId}, leaderEmails=${leaderEmails.join(', ')}`);

  try {
    // Calculate week of for thread lookup
    const getWeekOfDate = (date: Date): string => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      return monday.toISOString().split('T')[0];
    };
    const weekOf = getWeekOfDate(new Date());

    // Look up threadId from Firebase
    const lookupId = subTeamId ? `${subTeamId}_${weekOf}` : `${teamId}_${weekOf}`;
    const doc = await firestoreAdmin.collection('teamReminderThreads').doc(lookupId).get();
    
    let threadId: string | undefined = undefined;
    let messageId: string | undefined = undefined;
    let usedFallback = false;

    if (doc.exists) {
      const data = doc.data();
      threadId = data?.gmailThreadId || undefined;
      messageId = data?.gmailMessageId || undefined;
      logger.info(`Found existing thread for proof email: threadId=${threadId}, messageId=${messageId}`);
    } else {
      logger.info(`No existing thread found for proof email, sending as fresh thread (lookupId=${lookupId})`);
      usedFallback = true;
    }

    // Build email body using template system
    const displayName = subTeamName ? `${teamName} - ${subTeamName}` : teamName;
    
    // Build note section
    let noteSection = '';
    if (note) {
      noteSection = `Note:\n${note}\n\n`;
    }
    
    // Build attachments section
    let attachmentsSection = '';
    if (attachmentLinks) {
      attachmentsSection = `Attachments:\n${attachmentLinks.split(',').map((link, i) => `${i + 1}. ${link.trim()}`).join('\n')}\n`;
    }
    
    // Fetch template and replace variables
    const template = await getEmailTemplate('template_proof_email');
    if (!template) {
      logger.warn('Proof email template "template_proof_email" not found, using fallback hardcoded format');
    }
    const emailSubject = template ? replaceTemplateVariables(template.subject, {
      DisplayName: displayName
    }) : `Weekly Report Proof: ${displayName}`;
    const emailBody = template ? replaceTemplateVariables(template.body, {
      DisplayName: displayName,
      SubmittedBy: submittedBy,
      SubmittedAt: new Date().toLocaleString(),
      NoteSection: noteSection,
      AttachmentsSection: attachmentsSection
    }) : `Weekly report proof of submission for ${displayName}\n\nSubmitted by: ${submittedBy}\nSubmitted at: ${new Date().toLocaleString()}\n\n${noteSection}${attachmentsSection}`;

    // Fixed CC recipients per spec (sender is rajeev.1@pw.live, so don't CC yourself)
    const ccRecipients = ['utsav@pw.live'];
    const senderEmail = config.SYSTEM_SENDER_EMAIL;

    // Send to each leader with threading
    let successCount = 0;
    let fallbackCount = 0;
    for (const leaderEmail of leaderEmails) {
      try {
        const result = await sendEmailAsUser(
          senderEmail,
          leaderEmail,
          emailSubject,
          emailBody,
          undefined, // no template (we already replaced variables)
          undefined,
          threadId,
          messageId,
          undefined, // taskId
          teamId,
          subTeamId,
          'proof_email',
          weekOf
        );

        if (result.success) {
          if (result.usedFallback) {
            fallbackCount++;
            logger.warn(`Proof email to ${leaderEmail} used fallback (not actually sent)`);
          } else {
            successCount++;
            logger.info(`Proof email sent successfully to ${leaderEmail}`);
          }
        } else {
          logger.error(`Failed to send proof email to ${leaderEmail}`);
        }
      } catch (err) {
        logger.error(`Error sending proof email to ${leaderEmail}`, err);
      }
    }

    res.json({
      success: successCount > 0,
      sentToCount: successCount,
      fallbackCount,
      totalRecipients: leaderEmails.length,
      usedFallback,
      threadId: threadId || null
    });
  } catch (error) {
    logger.error('Error sending proof email:', error);
    res.status(500).json({ error: 'Failed to send proof email' });
  }
}

/**
 * GET /api/unsubmitted-teams
 * Protected endpoint to fetch list of teams that haven't submitted this week
 */
export async function getUnsubmittedTeams(req: AuthRequest, res: Response): Promise<void> {
  logger.info('Fetching unsubmitted teams for this week');

  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      res.status(500).json({ error: 'Failed to access Google Sheets' });
      return;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const accessToken = tokenData.accessToken;

    // Fetch settings to get unsubmitted_teams_this_week
    const settingsRows = await fetchSheetValues(accessToken, spreadsheetId, 'settings!A:B');
    if (!settingsRows) {
      res.json({ unsubmittedTeamIds: [] });
      return;
    }

    // Find the unsubmitted_teams_this_week setting
    const unsubmittedTeamsStr = settingsRows.find(row => row[0] === 'unsubmitted_teams_this_week')?.[1] || '';

    const unsubmittedTeamIds = unsubmittedTeamsStr
      ? unsubmittedTeamsStr.split(',').map(id => id.trim()).filter(Boolean)
      : [];

    // Fetch teams to get names
    const teamsRows = await fetchSheetValues(accessToken, spreadsheetId, 'teams!A:D');
    const teamsMap = new Map<string, string>();
    if (teamsRows && teamsRows.length > 1) {
      for (let i = 1; i < teamsRows.length; i++) {
        const row = teamsRows[i];
        if (row[0] && row[1]) {
          teamsMap.set(row[0], row[1]);
        }
      }
    }

    // Map team IDs to names
    const unsubmittedTeams = unsubmittedTeamIds.map(teamId => ({
      teamId,
      teamName: teamsMap.get(teamId) || 'Unknown Team'
    }));

    res.json({ unsubmittedTeams });
  } catch (error) {
    logger.error('Error fetching unsubmitted teams:', error);
    res.status(500).json({ error: 'Failed to fetch unsubmitted teams' });
  }
}

/**
 * GET /api/email-delivery-failures
 * Protected endpoint to fetch email delivery failures for the current week
 */
export async function getEmailDeliveryFailures(req: AuthRequest, res: Response): Promise<void> {
  logger.info('Fetching email delivery failures');

  try {
    // Calculate current week of (Monday-based)
    const getWeekOfDate = (date: Date): string => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      return monday.toISOString().split('T')[0];
    };
    const currentWeekOf = getWeekOfDate(new Date());

    // Fetch failures for current week from Firestore
    const snapshot = await firestoreAdmin
      .collection('email_delivery_failures')
      .where('weekOf', '==', currentWeekOf)
      .get();

    const failures = snapshot.docs.map(doc => doc.data());

    res.json({ failures, weekOf: currentWeekOf });
  } catch (error) {
    logger.error('Error fetching email delivery failures:', error);
    res.status(500).json({ error: 'Failed to fetch email delivery failures' });
  }
}
