import { generateGoogleSheetsToken, fetchSheetValues, appendSheetValues, updateSheetValues, createSheet } from './googleSheetsService';
import { logger } from '../utils/logger';
import { GmailToken } from './gmailOAuthService';

/**
 * Initializes the user_tokens sheet if it doesn't exist
 * This should be called during app initialization
 */
export async function initializeUserTokensSheet(): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('Failed to get Google Sheets token for initialization');
      return false;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    
    // Check if user_tokens sheet exists by trying to fetch it
    const existingValues = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'user_tokens!A1:E1');
    
    if (existingValues && existingValues.length > 0) {
      // Sheet already exists with headers
      return true;
    }

    // Create the sheet first
    await createSheet(tokenData.accessToken, spreadsheetId, 'user_tokens');

    // Create the sheet with headers
    const headers = [
      ['user_email', 'refresh_token', 'access_token', 'token_expiry', 'connected_at']
    ];

    const success = await appendSheetValues(tokenData.accessToken, spreadsheetId, 'user_tokens', headers);
    
    if (success) {
      logger.info('Initialized user_tokens sheet');
    }
    
    return success;
  } catch (err) {
    logger.error('Error initializing user_tokens sheet:', err);
    return false;
  }
}

/**
 * Saves Gmail OAuth tokens to the user_tokens sheet
 * @param userEmail - User's email address
 * @param refreshToken - OAuth refresh token
 * @param accessToken - OAuth access token
 * @param expiresIn - Access token expiry time in seconds
 * @returns true if successful, false otherwise
 */
export async function saveGmailToken(
  userEmail: string,
  refreshToken: string,
  accessToken: string,
  expiresIn: number
): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('Failed to get Google Sheets token');
      return false;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    
    // Check if user already has a token
    const existingValues = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'user_tokens!A:E');
    
    if (!existingValues) {
      logger.error('Failed to fetch existing tokens');
      return false;
    }

    const now = new Date();
    const tokenExpiry = new Date(now.getTime() + expiresIn * 1000).toISOString();
    const connectedAt = now.toISOString();
    const normalizedEmail = userEmail.toLowerCase();

    // Check if user already exists
    let rowIndex = -1;
    for (let i = 1; i < existingValues.length; i++) { // Skip header row
      if (existingValues[i][0] === normalizedEmail) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex > 0) {
      // Update existing row
      const updatedRow = [
        normalizedEmail,
        refreshToken,
        accessToken,
        tokenExpiry,
        connectedAt
      ];

      const success = await updateSheetValues(
        tokenData.accessToken,
        spreadsheetId,
        `user_tokens!A${rowIndex + 1}:E${rowIndex + 1}`,
        [updatedRow]
      );

      if (success) {
        logger.info(`Updated Gmail token for ${userEmail}`);
      }

      return success;
    } else {
      // Append new row
      const newRow = [
        normalizedEmail,
        refreshToken,
        accessToken,
        tokenExpiry,
        connectedAt
      ];

      const success = await appendSheetValues(tokenData.accessToken, spreadsheetId, 'user_tokens', [newRow]);

      if (success) {
        logger.info(`Saved new Gmail token for ${userEmail}`);
      }

      return success;
    }
  } catch (err) {
    logger.error('Error saving Gmail token:', err);
    return false;
  }
}

/**
 * Retrieves Gmail OAuth tokens for a user
 * @param userEmail - User's email address
 * @returns Gmail token data or null if not found
 */
export async function getGmailToken(userEmail: string): Promise<GmailToken | null> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('Failed to get Google Sheets token');
      return null;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const values = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'user_tokens!A:E');

    if (!values || values.length < 2) {
      return null;
    }

    const normalizedEmail = userEmail.toLowerCase();

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (row[0] === normalizedEmail) {
        return {
          userEmail: row[0],
          refreshToken: row[1],
          accessToken: row[2],
          tokenExpiry: row[3],
          connectedAt: row[4],
        };
      }
    }

    return null;
  } catch (err) {
    logger.error('Error getting Gmail token:', err);
    return null;
  }
}

/**
 * Updates the access token for a user
 * @param userEmail - User's email address
 * @param accessToken - New access token
 * @param expiresIn - Access token expiry time in seconds
 * @returns true if successful, false otherwise
 */
export async function updateGmailAccessToken(
  userEmail: string,
  accessToken: string,
  expiresIn: number
): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('Failed to get Google Sheets token');
      return false;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const values = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'user_tokens!A:E');

    if (!values) {
      return false;
    }

    const normalizedEmail = userEmail.toLowerCase();
    const now = new Date();
    const tokenExpiry = new Date(now.getTime() + expiresIn * 1000).toISOString();

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (row[0] === normalizedEmail) {
        row[2] = accessToken;
        row[3] = tokenExpiry;

        const success = await updateSheetValues(
          tokenData.accessToken,
          spreadsheetId,
          `user_tokens!A${i + 1}:E${i + 1}`,
          [row]
        );

        if (success) {
          logger.info(`Updated access token for ${userEmail}`);
        }

        return success;
      }
    }

    return false;
  } catch (err) {
    logger.error('Error updating Gmail access token:', err);
    return false;
  }
}

/**
 * Deletes Gmail OAuth tokens for a user (disconnect)
 * @param userEmail - User's email address
 * @returns true if successful, false otherwise
 */
export async function deleteGmailToken(userEmail: string): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('Failed to get Google Sheets token');
      return false;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    const values = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'user_tokens!A:E');

    if (!values) {
      return false;
    }

    const normalizedEmail = userEmail.toLowerCase();

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (row[0] === normalizedEmail) {
        // Clear the row by setting empty values
        const emptyRow = ['', '', '', '', ''];

        const success = await updateSheetValues(
          tokenData.accessToken,
          spreadsheetId,
          `user_tokens!A${i + 1}:E${i + 1}`,
          [emptyRow]
        );

        if (success) {
          logger.info(`Deleted Gmail token for ${userEmail}`);
        }

        return success;
      }
    }

    return false;
  } catch (err) {
    logger.error('Error deleting Gmail token:', err);
    return false;
  }
}

/**
 * Checks if a user has connected their Gmail account
 * @param userEmail - User's email address
 * @returns true if connected, false otherwise
 */
export async function isGmailConnected(userEmail: string): Promise<boolean> {
  const token = await getGmailToken(userEmail);
  if (!token) return false;
  if (!token.refreshToken || token.refreshToken.length === 0) return false;
  // Check if access token is expired - if it is, the refresh token might also be invalid
  const now = new Date();
  const tokenExpiry = new Date(token.tokenExpiry);
  // If access token is expired by more than 7 days, consider the connection stale
  const daysSinceExpiry = (now.getTime() - tokenExpiry.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceExpiry > 7) return false;
  return true;
}
