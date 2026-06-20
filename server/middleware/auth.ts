import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from '../utils/AppError';

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
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    throw new UnauthorizedError('Access token required');
  }

  jwt.verify(token, config.JWT_SECRET, (err: jwt.VerifyErrors | null, user: any) => {
    if (err) {
      throw new UnauthorizedError('Invalid or expired token');
    }
    req.user = user;
    next();
  });
};
