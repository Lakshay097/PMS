import { api } from './client';

export interface GmailStatusResponse {
  connected: boolean;
  email: string;
}

export interface GmailAuthUrlResponse {
  url: string;
}

/**
 * Check whether the currently authenticated user has a connected Gmail account.
 * Calls GET /api/auth/gmail/status
 */
export async function getGmailStatus(): Promise<GmailStatusResponse> {
  return api.get<GmailStatusResponse>('/auth/gmail/status');
}

/**
 * Retrieve the Gmail OAuth authorisation URL to send the user through the
 * consent flow.  Calls GET /api/auth/gmail/url
 */
export async function getGmailAuthUrl(): Promise<GmailAuthUrlResponse> {
  return api.get<GmailAuthUrlResponse>('/auth/gmail/url');
}
