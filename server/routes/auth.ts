import { Router } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { authenticateToken } from '../middleware/auth';
import { loginRateLimiter } from '../middleware/rateLimiters';
import * as authController from '../controllers/authController';

const router = Router();

/**
 * POST /api/login
 * Public endpoint for user login
 * Rate limited: 10 attempts per 15 minutes per IP
 */
router.post('/login', loginRateLimiter, asyncWrapper(authController.loginHandler));

/**
 * POST /api/account-request
 * Public endpoint for account requests
 */
router.post('/account-request', asyncWrapper(authController.accountRequestHandler));

/**
 * POST /api/approve-user
 * Protected endpoint to approve user accounts (Admin only)
 */
router.post('/approve-user', authenticateToken, asyncWrapper(authController.approveUserHandler));

/**
 * POST /api/change-password
 * Protected endpoint to change user password
 */
router.post('/change-password', authenticateToken, asyncWrapper(authController.changePasswordHandler));

/**
 * POST /api/refresh-token
 * Public endpoint to refresh JWT access token using refresh token
 * No authentication required - refresh token is passed in request body
 */
router.post('/refresh-token', asyncWrapper(authController.refreshTokenHandler));

/**
 * POST /api/refresh-token-legacy
 * Protected endpoint to refresh JWT token (legacy, for backward compatibility)
 * @deprecated Use /api/refresh-token with refresh token instead
 */
router.post('/refresh-token-legacy', authenticateToken, asyncWrapper(authController.refreshTokenHandlerLegacy));

/**
 * POST /api/bulk-upload-users
 * Protected endpoint to bulk upload users via CSV (Admin only)
 */
router.post('/bulk-upload-users', authenticateToken, asyncWrapper(authController.bulkUploadUsersHandler));

export default router;
