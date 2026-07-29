import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError, ForbiddenError } from '../utils/AppError';

/**
 * Extended Request interface with user property
 */
export interface AuthRequest extends Request {
  user?: {
    email: string;
    userId: string;
    role: string;
    fullName: string;
  };
}

/**
 * JWT Authentication middleware
 */
export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  console.log('[auth] authenticateToken called for', req.path);
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    console.log('[auth] no token found');
    throw new UnauthorizedError('Access token required');
  }

  console.log('[auth] verifying token...');
  jwt.verify(token, config.JWT_SECRET, (err: jwt.VerifyErrors | null, user: any) => {
    if (err) {
      console.log('[auth] token verification failed:', err.message);
      throw new UnauthorizedError('Invalid or expired token');
    }
    console.log('[auth] token verified successfully for user:', user?.email);
    req.user = user;
    next();
  });
};

/**
 * Middleware that restricts a route to Admin users only.
 * Admin is the top-level role — there is no SuperAdmin.
 * Must be used after authenticateToken.
 */
export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const role = req.user?.role;
  if (role !== 'Admin') {
    throw new ForbiddenError('Admin access required');
  }
  next();
};
