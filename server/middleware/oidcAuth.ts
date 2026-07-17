import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { UnauthorizedError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { config } from '../config';

/**
 * Extended Request interface with OIDC user property
 */
export interface OidcRequest extends Request {
  oidc?: {
    email: string;
    subject: string;
  };
}

/**
 * OIDC Authentication middleware for Cloud Scheduler
 * Verifies Google OIDC tokens using google-auth-library
 * 
 * This performs actual cryptographic verification of the token:
 * - Verifies signature against Google's public keys
 * - Checks audience matches the Cloud Run URL
 * - Checks issuer is https://accounts.google.com
 * - Checks token hasn't expired
 */
export const authenticateOidc = async (
  req: OidcRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
      logger.warn('OIDC authentication failed: No Authorization header');
      throw new UnauthorizedError('OIDC authentication required');
    }

    // Extract Bearer token
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);
    if (!tokenMatch) {
      logger.warn('OIDC authentication failed: Invalid Authorization header format');
      throw new UnauthorizedError('Invalid Authorization header format');
    }

    const idToken = tokenMatch[1];
    
    // Verify the token using Google's OAuth2Client
    // The audience must match the Cloud Run service URL
    const audience = config.APP_URL || 'https://pms-taskflow-556944241861.us-central1.run.app';
    const client = new OAuth2Client();
    
    const ticket = await client.verifyIdToken({
      idToken,
      audience: audience,
    });

    const payload = ticket.getPayload();
    
    if (!payload) {
      logger.warn('OIDC authentication failed: No payload in token');
      throw new UnauthorizedError('Invalid OIDC token');
    }

    // Verify issuer is Google
    if (payload.iss !== 'https://accounts.google.com') {
      logger.warn(`OIDC authentication failed: Invalid issuer: ${payload.iss}`);
      throw new UnauthorizedError('Invalid token issuer');
    }

    // Verify email is present
    if (!payload.email) {
      logger.warn('OIDC authentication failed: No email in token payload');
      throw new UnauthorizedError('Invalid token payload');
    }

    // Verify the token belongs to the expected scheduler service account
    // This prevents any authenticated Google principal from minting a token for this audience
    const expectedSchedulerEmail = config.SCHEDULER_SERVICE_ACCOUNT_EMAIL;
    if (!expectedSchedulerEmail) {
      logger.error('OIDC authentication failed: SCHEDULER_SERVICE_ACCOUNT_EMAIL not configured');
      throw new UnauthorizedError('Server configuration error');
    }

    if (payload.email !== expectedSchedulerEmail) {
      logger.warn(`OIDC authentication failed: unexpected caller ${payload.email}, expected ${expectedSchedulerEmail}`);
      throw new UnauthorizedError('Unauthorized caller');
    }

    req.oidc = {
      email: payload.email,
      subject: payload.sub || payload.email
    };

    logger.info(`OIDC authenticated request from ${payload.email} (${payload.sub})`);
    next();

  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    
    logger.error('OIDC authentication failed:', error);
    throw new UnauthorizedError('OIDC token verification failed');
  }
};
