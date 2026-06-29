import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Gmail OAuth token storage interface
 */
export interface GmailToken {
  userEmail: string;
  refreshToken: string;
  accessToken: string;
  tokenExpiry: string;
  connectedAt: string;
}

/**
 * Google OAuth token response
 */
export interface GoogleOAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/**
 * Generates the Google OAuth URL for Gmail authorization
 * @param state - Random state string for CSRF protection
 * @returns OAuth authorization URL
 */
export function getGmailAuthUrl(state: string): string {
  const scopes = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email'
  ].join(' ');

  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: config.GMAIL_REDIRECT_URI,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline', // Required to get refresh token
    prompt: 'consent', // Required to get refresh token
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchanges authorization code for access and refresh tokens
 * @param code - Authorization code from OAuth callback
 * @returns Token response or null if failed
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleOAuthTokenResponse | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: config.GMAIL_REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorData = await response.json().catch(() => ({}));
      logger.error('Failed to exchange code for tokens:', { 
        status: response.status, 
        errorText, 
        errorData,
        redirect_uri: config.GMAIL_REDIRECT_URI,
        client_id: config.GOOGLE_CLIENT_ID?.substring(0, 20) + '...'
      });
      return null;
    }

    const data = await response.json();
    return data;
  } catch (err) {
    logger.error('Error exchanging code for tokens:', err);
    return null;
  }
}

/**
 * Refreshes an access token using a refresh token
 * @param refreshToken - Refresh token
 * @returns New token response or null if failed
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleOAuthTokenResponse | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorData = await response.json().catch(() => ({}));
      logger.error('Failed to refresh access token:', { status: response.status, errorText, errorData });
      return null;
    }

    const data = await response.json();
    return data;
  } catch (err) {
    logger.error('Error refreshing access token:', err);
    return null;
  }
}

/**
 * Gets user info from Google using access token
 * @param accessToken - Valid access token
 * @returns User email or null if failed
 */
export async function getUserEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      logger.error('Failed to get user info:', await response.text());
      return null;
    }

    const data = await response.json();
    return data.email || null;
  } catch (err) {
    logger.error('Error getting user email:', err);
    return null;
  }
}
