import { getRedis } from '../database/redis';
import { getPrisma } from '../database/prisma';
import { logger } from '../utils/logger';

const ABUSE_PREFIX = 'abuse:';
const MAX_FAILED_ATTEMPTS = 5;
const BAN_DURATION_SECONDS = 3600; // 1 hour

export async function trackFailedAttempt(identifier: string, type: string): Promise<boolean> {
  const redis = getRedis();
  const key = `${ABUSE_PREFIX}${type}:${identifier}`;
  const attempts = await redis.incr(key);
  
  if (attempts === 1) {
    await redis.expire(key, BAN_DURATION_SECONDS);
  }

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    logger.warn(`Abuse detected: ${type} for ${identifier} (${attempts} attempts)`);
    return true; // Threshold exceeded
  }

  return false;
}

export async function resetFailedAttempts(identifier: string, type: string): Promise<void> {
  const redis = getRedis();
  const key = `${ABUSE_PREFIX}${type}:${identifier}`;
  await redis.del(key);
}

export async function checkIpThrottle(ip: string): Promise<boolean> {
  const redis = getRedis();
  const key = `${ABUSE_PREFIX}ip:${ip}`;
  const count = await redis.incr(key);
  
  if (count === 1) {
    await redis.expire(key, 60); // 1 minute window
  }

  return count > 30; // Max 30 requests per minute per IP
}

export async function checkDeviceThrottle(fingerprint: string): Promise<boolean> {
  const redis = getRedis();
  const key = `${ABUSE_PREFIX}device:${fingerprint}`;
  const count = await redis.incr(key);
  
  if (count === 1) {
    await redis.expire(key, 60);
  }

  return count > 20; // Max 20 requests per minute per device
}

export async function banDevice(fingerprint: string, reason: string, durationHours: number = 24) {
  const prisma = getPrisma();
  const redis = getRedis();

  // Find device and its user
  const device = await prisma.device.findUnique({
    where: { fingerprint },
    include: { user: true },
  });

  if (device) {
    // Ban user if exists
    if (device.userId) {
      await prisma.user.update({
        where: { id: device.userId },
        data: {
          isBanned: true,
          banReason: reason,
          bannedUntil: new Date(Date.now() + durationHours * 3600000),
        },
      });
    }

    // Mark device
    await prisma.device.update({
      where: { fingerprint },
      data: { isVerified: false },
    });
  }

  // Set Redis ban flag
  const key = `${ABUSE_PREFIX}banned:${fingerprint}`;
  await redis.set(key, reason, 'EX', durationHours * 3600);
  
  logger.warn(`Banned device ${fingerprint.substring(0, 16)}... for ${durationHours}h: ${reason}`);
}

export async function isDeviceBanned(fingerprint: string): Promise<boolean> {
  const redis = getRedis();
  const key = `${ABUSE_PREFIX}banned:${fingerprint}`;
  const banned = await redis.get(key);
  return !!banned;
}

export async function detectAbusePattern(userId: string): Promise<string | null> {
  const prisma = getPrisma();
  
  // Check for rapid order creation (potential fraud)
  const recentOrders = await prisma.order.count({
    where: {
      userId,
      createdAt: {
        gte: new Date(Date.now() - 60000), // Last 1 minute
      },
    },
  });

  if (recentOrders > 3) {
    return 'Rapid order creation detected';
  }

  // Check for excessive cancelled orders
  const recentCancelled = await prisma.order.count({
    where: {
      userId,
      status: 'CANCELLED',
      createdAt: {
        gte: new Date(Date.now() - 3600000), // Last hour
      },
    },
  });

  if (recentCancelled > 5) {
    return 'Excessive order cancellations';
  }

  return null;
}
