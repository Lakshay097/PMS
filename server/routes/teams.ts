import { Router, Request, Response } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { firestoreAdmin } from '../services/firebaseAdmin';

const router = Router();

/**
 * GET /api/teams/public
 * Public endpoint — no auth required.
 * Returns the name and ID of every active team so the registration form
 * can offer a team dropdown without exposing any user or task data.
 */
router.get(
  '/teams/public',
  asyncWrapper(async (_req: Request, res: Response) => {
    const snapshot = await firestoreAdmin.collection('teams').get();

    const teams = snapshot.docs
      .map(doc => {
        const data = doc.data();
        return {
          TeamID:   data.TeamID   as string,
          TeamName: data.TeamName as string,
          Active:   data.Active   as boolean,
        };
      })
      .filter(t => t.Active)
      .sort((a, b) => a.TeamName.localeCompare(b.TeamName));

    res.json({ success: true, teams });
  })
);

export default router;
