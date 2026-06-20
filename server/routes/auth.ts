import { Router } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { authenticateToken } from '../middleware/auth';
import * as authController from '../controllers/authController';

const router = Router();

/**
 * POST /api/login
 * Public endpoint for user login
 */
router.post('/login', asyncWrapper(authController.loginHandler));

/**
 * POST /api/account-request
 * Public endpoint for account requests
 */
router.post('/account-request', asyncWrapper(authController.accountRequestHandler));

/**
 * POST /api/approve-user
 * Protected endpoint to approve user accounts
 */
router.post('/approve-user', authenticateToken, asyncWrapper(authController.approveUserHandler));

export default router;
