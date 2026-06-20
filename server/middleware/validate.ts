import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../utils/AppError';
import { z } from 'zod';

/**
 * Validation middleware factory using Zod
 * @param schema - Zod schema to validate against
 * @returns Express middleware function
 */
export const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.issues.map(e => e.message).join(', ');
        throw new BadRequestError(errorMessage);
      }
      throw new BadRequestError('Validation failed');
    }
  };
};
