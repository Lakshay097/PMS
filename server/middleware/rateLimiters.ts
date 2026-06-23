import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

/**
 * OAuth rate limiter - 20 requests per 15 minutes per IP
 * Uses standard rate limiting to prevent timeout issues
 */
export const oauthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    error: 'Too many authentication attempts, please wait 15 minutes before trying again'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Login rate limiter - 10 requests per 15 minutes per IP
 * Uses standard rate limiting to prevent timeout issues
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    error: 'Too many login attempts, please wait 15 minutes before trying again'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
