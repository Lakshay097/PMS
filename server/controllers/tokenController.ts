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
    res.status(400).json({ 
      active: false,
      error: "Google Service Account credentials not provided in environment. Please configure GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY." 
    });
    return;
  }

  res.json(tokenData);
}
