import { Request, Response } from 'express';
import { generateGoogleSheetsToken } from '../services/googleSheetsService';
import { InternalServerError } from '../utils/AppError';

/**
 * GET /api/token
 * Public endpoint to get Google Sheets Service Account token
 * Needed for app initialization
 */
export async function getTokenHandler(req: Request, res: Response): Promise<void> {
  const tokenData = await generateGoogleSheetsToken();
  
  if (!tokenData) {
    const missingCreds =
      !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ||
      !process.env.GOOGLE_PRIVATE_KEY?.trim();

    res.status(missingCreds ? 503 : 502).json({
      active: false,
      error: missingCreds
        ? 'Google Service Account credentials not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in .env.'
        : 'Google Service Account token exchange failed. Check that GOOGLE_PRIVATE_KEY is valid and formatted with \\n line breaks.',
    });
    return;
  }

  res.json(tokenData);
}
