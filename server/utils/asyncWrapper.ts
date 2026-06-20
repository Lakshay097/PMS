import { Request, Response, NextFunction } from 'express';
import { InternalServerError } from './AppError';

/**
 * Wraps async route handlers to catch errors and pass them to error middleware
 * @param fn - Async function to wrap
 * @returns Express middleware function
 */
export const asyncWrapper = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
