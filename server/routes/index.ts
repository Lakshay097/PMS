import { Router } from 'express';
import authRoutes from './auth';
import uploadRoutes from './upload';
import tokenRoutes from './token';
import sheetsRoutes from './sheets';
import gmailAuthRoutes from './gmailAuth';
import emailTriggerRoutes from './emailTrigger';
import emailTemplateRoutes from './emailTemplate';
import teamsRoutes from './teams';
import teamReminderRoutes from './teamReminder';
import reportReminderRoutes from './reportReminder';

const router = Router();

// Mount route modules
router.use('/', authRoutes);
router.use('/', uploadRoutes);
router.use('/', tokenRoutes);
router.use('/sheets', sheetsRoutes);
router.use('/auth', gmailAuthRoutes);
router.use('/email/trigger', emailTriggerRoutes);
router.use('/', emailTemplateRoutes);
router.use('/', teamsRoutes);
router.use('/', teamReminderRoutes);
router.use('/report-reminders', reportReminderRoutes);

export default router;
