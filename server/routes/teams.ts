import { Router, Request, Response } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { generateGoogleSheetsToken, fetchSheetValues } from '../services/googleSheetsService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/teams/public
 * Public endpoint — no auth required.
 * Returns the name and ID of every active team so the registration form
 * can offer a team dropdown without exposing any user or task data.
 * Reads from Google Sheets (source of truth) instead of Firestore.
 */
router.get(
  '/teams/public',
  asyncWrapper(async (_req: Request, res: Response) => {
    const tokenData = await generateGoogleSheetsToken();
    if (!tokenData || !tokenData.spreadsheetId) {
      return res.status(500).json({ success: false, error: 'Failed to access Google Sheets' });
    }

    const rows = await fetchSheetValues(tokenData.accessToken, tokenData.spreadsheetId, 'teams!A:D');
    logger.info(`Teams from Sheets: ${JSON.stringify(rows)}`);
    if (!rows || rows.length <= 1) {
      return res.json({ success: true, teams: [] });
    }

    const teams = rows.slice(1).map(row => ({
      TeamID: row[0] as string,
      TeamName: row[1] as string,
      Active: row[3] === 'true' || row[3] === true || row[3] === 'TRUE' || row[3] === '1' || row[3] === 1,
    })).filter(t => t.Active && t.TeamID && t.TeamName)
      .sort((a, b) => a.TeamName.localeCompare(b.TeamName));

    logger.info(`Filtered teams: ${JSON.stringify(teams)}`);

    res.json({ success: true, teams });
  })
);

export default router;
