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
      logger.error("Google SA Token fetch failed:", errorText);
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
