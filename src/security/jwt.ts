import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { getRedis } from '../database/redis';

export interface JwtPayload {
  userId: string;
  deviceId: string;
  role: string;
  fingerprint: string;
  iat?: number;
  exp?: number;
}

export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: '15m',
    algorithm: 'HS512',
  });
}

export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: '7d',
    algorithm: 'HS512',
  });
}

export function verifyToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS512'],
    }) as JwtPayload;
    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    }
    throw new Error('Invalid token');
  }
}

export async function storeRefreshToken(userId: string, deviceId: string, token: string): Promise<void> {
  const redis = getRedis();
  const key = `refresh:${userId}:${deviceId}`;
  await redis.set(key, token, 'EX', 7 * 24 * 60 * 60); // 7 days
  logger.debug(`Stored refresh token for user ${userId}, device ${deviceId}`);
}

export async function validateRefreshToken(userId: string, deviceId: string, token: string): Promise<boolean> {
  const redis = getRedis();
  const key = `refresh:${userId}:${deviceId}`;
  const stored = await redis.get(key);
  return stored === token;
}

export async function revokeRefreshToken(userId: string, deviceId: string): Promise<void> {
  const redis = getRedis();
  const key = `refresh:${userId}:${deviceId}`;
  await redis.del(key);
  logger.debug(`Revoked refresh token for user ${userId}, device ${deviceId}`);
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  const redis = getRedis();
  const keys = await redis.keys(`refresh:${userId}:*`);
  if (keys.length > 0) {
    await redis.del(keys);
    logger.debug(`Revoked all refresh tokens for user ${userId}`);
  }
}
