import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../../security/jwt';
import { verifyFingerprintIntegrity } from '../../security/deviceFingerprint';
import { AppError } from './errorHandler.middleware';
import { logger } from '../../utils/logger';

// Extend Express Request to include user and device info
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { userId: string; deviceId: string; role: string };
      deviceFingerprint?: string;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    // 1. Extract Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Missing or invalid Authorization header', 401);
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new AppError('No token provided', 401);
    }

    // 2. Verify JWT
    const decoded = verifyToken(token);
    
    // 3. Verify device fingerprint in header matches JWT claim
    const deviceFingerprint = req.headers['x-device-fingerprint'] as string;
    if (!deviceFingerprint) {
      throw new AppError('Missing device fingerprint', 401);
    }

    if (!verifyFingerprintIntegrity(deviceFingerprint)) {
      throw new AppError('Invalid device fingerprint format', 401);
    }

    if (decoded.fingerprint !== deviceFingerprint) {
      logger.warn(`Fingerprint mismatch: JWT=${decoded.fingerprint?.substring(0, 16)}... Header=${deviceFingerprint.substring(0, 16)}...`);
      throw new AppError('Device fingerprint mismatch', 401);
    }

    // 4. Attach user info to request
    req.user = {
      userId: decoded.userId,
      deviceId: decoded.deviceId,
      role: decoded.role,
      fingerprint: deviceFingerprint,
    };
    req.deviceFingerprint = deviceFingerprint;

    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    if (error instanceof Error && error.message === 'Token expired') {
      return next(new AppError('Token expired', 401));
    }
    return next(new AppError('Authentication failed', 401));
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }

  try {
    const token = authHeader.split(' ')[1];
    if (!token) return next();

    const decoded = verifyToken(token);
    const deviceFingerprint = req.headers['x-device-fingerprint'] as string;
    
    if (deviceFingerprint && decoded.fingerprint === deviceFingerprint) {
      req.user = {
        userId: decoded.userId,
        deviceId: decoded.deviceId,
        role: decoded.role,
        fingerprint: deviceFingerprint,
      };
      req.deviceFingerprint = deviceFingerprint;
    }
  } catch {
    // Ignore invalid tokens for optional auth
  }
  next();
}
