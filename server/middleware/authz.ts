import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

/**
 * Middleware that restricts a route to specific roles.
 * Must be used after authenticateToken.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const userRole = req.user?.role;
    
    if (!userRole) {
      res.status(403).json({ error: 'Forbidden: No role assigned' });
      return;
    }

    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
      return;
    }

    next();
  };
}
