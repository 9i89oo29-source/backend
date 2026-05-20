import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';

export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many requests, please try again later.',
    retryAfter: env.RATE_LIMIT_WINDOW_MS / 1000,
  },
  keyGenerator: (req) => {
    // Use device fingerprint if available, otherwise IP
    return req.headers['x-device-fingerprint'] as string || req.ip || 'unknown';
  },
});
