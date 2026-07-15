import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getGmailAuthUrl, exchangeCodeForTokens, getUserEmail } from '../services/gmailOAuthService';
import { saveGmailToken, deleteGmailToken, isGmailConnected } from '../services/gmailTokenStorage';
import { initializeUserTokensSheet } from '../services/gmailTokenStorage';
import { initializeEmailTemplatesSheet, migrateEmailTemplates } from '../services/emailTemplateStorage';
import { initializeEmailLogsSheet, initializeTaskEmailThreadsSheet, initializeTeamEmailThreadsSheet } from '../services/emailLogService';
import { logger } from '../utils/logger';

/**
 * Initialize email-related sheets (called on server startup)
 */
export async function initializeEmailSheets(): Promise<void> {
  try {
    await Promise.all([
      initializeUserTokensSheet(),
      initializeEmailTemplatesSheet(),
      initializeEmailLogsSheet(),
      initializeTaskEmailThreadsSheet(),
      initializeTeamEmailThreadsSheet(),
    ]);
    // Overwrite any templates whose defaults changed in code (safe upsert)
    await migrateEmailTemplates();
    logger.info('Email sheets initialized successfully');
  } catch (err) {
    logger.error('Error initializing email sheets:', err);
  }
}

/**
 * GET /api/auth/gmail/url
 * Returns the Gmail OAuth authorization URL
 */
export async function getGmailAuthUrlHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const state = Math.random().toString(36).substring(2, 15) + 
                 Math.random().toString(36).substring(2, 15);
    
    const authUrl = getGmailAuthUrl(state);
    
    res.json({
      authUrl,
      state,
    });
  } catch (err) {
    logger.error('Error generating Gmail auth URL:', err);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
}

/**
 * GET /api/auth/gmail/callback
 * Handles the OAuth callback from Google
 */
export async function gmailCallbackHandler(req: Request, res: Response): Promise<void> {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.error('Gmail OAuth error:', error);
      return res.redirect(`${process.env.APP_URL || 'http://localhost:3000'}/settings?email_error=${error}`);
    }

    if (!code) {
      logger.error('Gmail OAuth callback missing code');
      return res.redirect(`${process.env.APP_URL || 'http://localhost:3000'}/settings?email_error=missing_code`);
    }

    // Exchange code for tokens
    const tokenData = await exchangeCodeForTokens(code as string);
    
    if (!tokenData) {
      logger.error('Failed to exchange code for tokens');
      return res.redirect(`${process.env.APP_URL || 'http://localhost:3000'}/settings?email_error=token_exchange_failed`);
    }

    // Get user email from the access token
    const userEmail = await getUserEmail(tokenData.access_token);
    
    if (!userEmail) {
      logger.error('Failed to get user email from token');
      return res.redirect(`${process.env.APP_URL || 'http://localhost:3000'}/settings?email_error=failed_to_get_email`);
    }

    // Save the tokens
    const success = await saveGmailToken(
      userEmail,
      tokenData.refresh_token || '',
      tokenData.access_token,
      tokenData.expires_in
    );

    if (!success) {
      logger.error('Failed to save Gmail token');
      return res.redirect(`${process.env.APP_URL || 'http://localhost:3000'}/settings?email_error=save_failed`);
    }

    logger.info(`Gmail connected successfully for ${userEmail}`);
    res.redirect(`${process.env.APP_URL || 'http://localhost:3000'}/settings?email_success=true`);
  } catch (err) {
    logger.error('Error in Gmail callback:', err);
    res.redirect(`${process.env.APP_URL || 'http://localhost:3000'}/settings?email_error=unknown_error`);
  }
}

/**
 * GET /api/auth/gmail/status
 * Check if the current user has connected their Gmail
 */
export async function getGmailStatusHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;
    
    if (!userEmail) {
      res.status(400).json({ error: 'User email not found' });
      return;
    }

    const connected = await isGmailConnected(userEmail);
    
    res.json({
      connected,
      email: userEmail,
    });
  } catch (err) {
    logger.error('Error checking Gmail status:', err);
    res.status(500).json({ error: 'Failed to check Gmail status' });
  }
}

/**
 * POST /api/auth/gmail/disconnect
 * Disconnect the user's Gmail account
 */
export async function disconnectGmailHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;
    
    if (!userEmail) {
      res.status(400).json({ error: 'User email not found' });
      return;
    }

    const success = await deleteGmailToken(userEmail);
    
    if (success) {
      logger.info(`Gmail disconnected for ${userEmail}`);
      res.json({
        success: true,
        message: 'Gmail disconnected successfully',
      });
    } else {
      res.status(500).json({ error: 'Failed to disconnect Gmail' });
    }
  } catch (err) {
    logger.error('Error disconnecting Gmail:', err);
    res.status(500).json({ error: 'Failed to disconnect Gmail' });
  }
}
