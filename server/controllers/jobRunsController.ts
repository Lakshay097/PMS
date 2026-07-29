import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/auth';
import { firestoreAdmin } from '../services/firebaseAdmin';
import { logger } from '../utils/logger';

/**
 * GET /api/job-runs
 * Admin-only endpoint to fetch job runs from Firestore
 * Returns recent job runs with email status tracking
 */
export async function getJobRunsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const jobName = req.query.jobName as string;

    let query = firestoreAdmin.collection('job_runs')
      .orderBy('timestamp', 'desc')
      .limit(limit);

    if (jobName) {
      query = query.where('jobName', '==', jobName);
    }

    const snapshot = await query.get();
    const jobRuns = snapshot.docs.map(doc => doc.data());

    res.json({
      success: true,
      jobRuns,
      count: jobRuns.length
    });
  } catch (error) {
    logger.error('Error fetching job runs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job runs'
    });
  }
}

/**
 * GET /api/job-runs/latest/:jobName
 * Admin-only endpoint to fetch the latest run for a specific job
 */
export async function getLatestJobRunHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { jobName } = req.params;

    const snapshot = await firestoreAdmin.collection('job_runs')
      .where('jobName', '==', jobName)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      res.json({
        success: true,
        jobRun: null
      });
      return;
    }

    const jobRun = snapshot.docs[0].data();

    res.json({
      success: true,
      jobRun
    });
  } catch (error) {
    logger.error('Error fetching latest job run:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch latest job run'
    });
  }
}
