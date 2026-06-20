import { api } from './client';

/**
 * Google Sheets token response
 */
export interface GoogleSheetsTokenResponse {
  accessToken: string;
  spreadsheetId: string | null;
  expiresIn: number;
  serviceAccountActive: boolean;
}

/**
 * Get Google Sheets Service Account token
 */
export async function getGoogleSheetsToken(): Promise<GoogleSheetsTokenResponse> {
  return api.get<GoogleSheetsTokenResponse>('/token', { skipAuth: true });
}
