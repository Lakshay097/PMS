import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Google Sheets token response interface
 */
export interface GoogleSheetsTokenResponse {
  accessToken: string;
  spreadsheetId: string | null;
  expiresIn: number;
  serviceAccountActive: boolean;
}

/**
 * Generates a Google Sheets access token using JWT
 * @returns GoogleSheetsTokenResponse or null if credentials are missing
 */
export async function generateGoogleSheetsToken(): Promise<GoogleSheetsTokenResponse | null> {
  try {
    const email = config.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
    const privateKey = config.GOOGLE_PRIVATE_KEY?.trim();
    const spreadsheetId = config.GOOGLE_SPREADSHEET_ID?.trim();

    if (!email || !privateKey) {
      logger.error("Google Service Account credentials not provided in environment.");
      return null;
    }

    // Warn early if key doesn't look like a valid PEM block — catches secrets
    // stored incorrectly in Cloud Secret Manager (e.g. extra escaping).
    const formattedKeyCheck = privateKey.replace(/\\n/g, "\n");
    if (!formattedKeyCheck.includes('-----BEGIN PRIVATE KEY-----')) {
      logger.error("GOOGLE_PRIVATE_KEY does not appear to be a valid PEM key. Check that the secret is stored with real newlines (not escaped \\\\n) in Cloud Secret Manager.");
    }

    // RS256 JWT claims
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + config.JWT_EXPIRATION_SECONDS;
    const claims = {
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
      aud: "https://oauth2.googleapis.com/token",
      exp,
      iat
    };

    const header = { alg: "RS256", typ: "JWT" };
    const base64UrlHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
    const base64UrlPayload = Buffer.from(JSON.stringify(claims)).toString("base64url");

    const sign = crypto.createSign("RSA-SHA256");
    sign.update(`${base64UrlHeader}.${base64UrlPayload}`);
    
    const formattedKey = privateKey.replace(/\\n/g, "\n");
    const signature = sign.sign(formattedKey, "base64url");

    const jwt = `${base64UrlHeader}.${base64UrlPayload}.${signature}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt
      })
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      logger.error(`Google SA Token fetch failed (HTTP ${tokenRes.status}):`, errorText);
      logger.error(`Service account email used: ${email}`);
      return null;
    }

    const tokenData = await tokenRes.json();
    return {
      accessToken: tokenData.access_token,
      spreadsheetId: spreadsheetId || null,
      expiresIn: tokenData.expires_in,
      serviceAccountActive: true
    };
  } catch (err: unknown) {
    logger.error("Error generating Google Sheets token:", err);
    return null;
  }
}

/**
 * Fetches values from a Google Sheets range
 * @param accessToken - Google OAuth access token
 * @param spreadsheetId - Google Sheets spreadsheet ID
 * @param range - Sheet range (e.g., 'users!A:R')
 * @returns Array of row values or null if failed
 */
export async function fetchSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string
): Promise<any[][] | null> {
  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!res.ok) {
      logger.error(`Failed to fetch sheet range ${range}:`, await res.text());
      return null;
    }

    const data = await res.json();
    return data.values || [];
  } catch (err) {
    logger.error(`Error fetching sheet range ${range}:`, err);
    return null;
  }
}

/**
 * Appends values to a Google Sheets range
 * @param accessToken - Google OAuth access token
 * @param spreadsheetId - Google Sheets spreadsheet ID
 * @param range - Sheet range (e.g., 'users')
 * @param values - Array of row values to append
 * @returns true if successful, false otherwise
 */
export async function appendSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values
        })
      }
    );

    if (!res.ok) {
      logger.error(`Failed to append to sheet range ${range}:`, await res.text());
      return false;
    }

    return true;
  } catch (err) {
    logger.error(`Error appending to sheet range ${range}:`, err);
    return false;
  }
}

/**
 * Updates values in a Google Sheets range
 * @param accessToken - Google OAuth access token
 * @param spreadsheetId - Google Sheets spreadsheet ID
 * @param range - Sheet range (e.g., 'users!A1:R1')
 * @param values - Array of row values to update
 * @returns true if successful, false otherwise
 */
export async function updateSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values
        })
      }
    );

    if (!res.ok) {
      logger.error(`Failed to update sheet range ${range}:`, await res.text());
      return false;
    }

    return true;
  } catch (err) {
    logger.error(`Error updating sheet range ${range}:`, err);
    return false;
  }
}

/**
 * Creates a new sheet in the spreadsheet
 * @param accessToken - Google OAuth access token
 * @param spreadsheetId - Google Sheets spreadsheet ID
 * @param sheetName - Name of the sheet to create
 * @returns true if successful, false otherwise
 */
export async function createSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName
                }
              }
            }
          ]
        })
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      // Sheet might already exist, check for that specific error
      if (errorText.includes('already exists')) {
        return true;
      }
      logger.error(`Failed to create sheet ${sheetName}:`, errorText);
      return false;
    }

    // Wait for sheet to be created
    await new Promise(resolve => setTimeout(resolve, 1000));

    return true;
  } catch (err) {
    logger.error(`Error creating sheet ${sheetName}:`, err);
    return false;
  }
}

/**
 * Fetches a single row from a sheet based on a filter
 * @param accessToken - Google OAuth access token
 * @param spreadsheetId - Google Sheets spreadsheet ID
 * @param sheetName - Name of the sheet
 * @param filterColumn - Column to filter on (0-indexed)
 * @param filterValue - Value to match
 * @returns The matching row or null
 */
export async function fetchRowByFilter(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  filterColumn: number,
  filterValue: string
): Promise<string[] | null> {
  try {
    const values = await fetchSheetValues(accessToken, spreadsheetId, `${sheetName}!A:Z`);
    
    if (!values || values.length < 2) {
      return null;
    }

    // Skip header row, find matching row
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (row[filterColumn] === filterValue) {
        return row;
      }
    }

    return null;
  } catch (err) {
    logger.error(`Error fetching row by filter from ${sheetName}:`, err);
    return null;
  }
}

/**
 * Initializes the team_submissions sheet if it doesn't exist
 * This should be called during app initialization
 */
export async function initializeTeamSubmissionsSheet(): Promise<boolean> {
  try {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      logger.error('Failed to get Google Sheets token for team submissions initialization');
      return false;
    }

    const spreadsheetId = tokenData.spreadsheetId;
    
    // Check if team_submissions sheet exists by trying to fetch it
    const existingValues = await fetchSheetValues(tokenData.accessToken, spreadsheetId, 'team_submissions!A1:F1');
    
    if (existingValues && existingValues.length > 0) {
      // Sheet already exists with headers
      return true;
    }

    // Create the sheet first
    await createSheet(tokenData.accessToken, spreadsheetId, 'team_submissions');

    // Create the sheet with headers
    const headers = [
      ['SubmissionID', 'TeamID', 'SubmittedBy', 'SubmittedAt', 'Note', 'AttachmentLinks']
    ];

    const success = await appendSheetValues(tokenData.accessToken, spreadsheetId, 'team_submissions', headers);
    
    if (success) {
      logger.info('Initialized team_submissions sheet');
    }
    
    return success;
  } catch (err) {
    logger.error('Error initializing team_submissions sheet:', err);
    return false;
  }
}

/**
 * Saves an entire collection to Google Sheets by clearing and rewriting
 * This is a server-side implementation for the sync controller
 * @param accessToken - Google OAuth access token
 * @param spreadsheetId - Google Sheets spreadsheet ID
 * @param sheetName - Name of the sheet
 * @param data - Array of objects to write (first row should be headers)
 * @returns true if successful, false otherwise
 */
export async function saveCollection(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  data: any[]
): Promise<boolean> {
  try {
    // Convert data to 2D array (including headers)
    if (data.length === 0) {
      logger.warn(`Attempted to save empty collection ${sheetName}`);
      return true; // Nothing to save
    }

    const headers = Object.keys(data[0]);
    const values = [headers, ...data.map(row => headers.map(header => row[header] || ''))];

    // Clear the sheet first (write empty range to remove old data)
    const clearRange = `${sheetName}!A2:Z9999`;
    await updateSheetValues(accessToken, spreadsheetId, clearRange, []);

    // Write new data (starting from row 2 to preserve headers)
    const writeRange = `${sheetName}!A2:Z${values.length}`;
    const success = await updateSheetValues(accessToken, spreadsheetId, writeRange, values.slice(1));

    if (success) {
      logger.info(`Saved ${data.length} records to ${sheetName}`);
    }

    return success;
  } catch (err) {
    logger.error(`Error saving collection ${sheetName}:`, err);
    return false;
  }
}
