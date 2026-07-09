import { Router } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { authenticateToken } from '../middleware/auth';
import * as teamReminderController from '../controllers/teamReminderController';

const router = Router();

/**
 * GET /api/team-reminder-thread/:teamId/:weekOf
 * Protected endpoint to fetch threadId/messageId for a team's weekly reminder
 */
router.get('/team-reminder-thread/:teamId/:weekOf', authenticateToken, asyncWrapper(teamReminderController.getTeamReminderThread));

/**
 * POST /api/send-proof-email
 * Protected endpoint to send proof email with attachment after team submission
 */
router.post('/send-proof-email', authenticateToken, asyncWrapper(teamReminderController.sendProofEmail));

/**
 * GET /api/unsubmitted-teams
 * Protected endpoint to fetch list of teams that haven't submitted this week
 */
router.get('/unsubmitted-teams', authenticateToken, asyncWrapper(teamReminderController.getUnsubmittedTeams));

/**
 * GET /api/email-delivery-failures
 * Protected endpoint to fetch email delivery failures for current week
 */
router.get('/email-delivery-failures', authenticateToken, asyncWrapper(teamReminderController.getEmailDeliveryFailures));

export default router;
