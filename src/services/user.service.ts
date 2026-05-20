import { getPrisma } from '../database/prisma';
import { getRedis } from '../database/redis';
import { logger } from '../utils/logger';
import { AppError } from '../api/middleware/errorHandler.middleware';
import { revokeAllUserTokens } from '../security/jwt';

export async function getUserProfile(userId: string) {
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      devices: {
        select: {
          fingerprint: true,
          lastSeen: true,
          createdAt: true,
        },
      },
      subscription: true,
      _count: {
        select: {
          orders: true,
        },
      },
    },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return {
    id: user.id,
    telegramId: user.telegramId ? Number(user.telegramId) : null,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    languageCode: user.languageCode,
    role: user.role,
    balance: Number(user.balance),
    subscription: user.subscription,
    subscriptionDetails: user.subscription,
    isBanned: user.isBanned,
    banReason: user.banReason,
    bannedUntil: user.bannedUntil,
    devices: user.devices,
    totalOrders: user._count.orders,
    createdAt: user.createdAt,
  };
}

export async function getUserBalance(userId: string): Promise<{ balance: number; currency: string }> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return {
    balance: Number(user.balance),
    currency: 'USD',
  };
}

export async function addBalance(
  userId: string,
  amount: number,
  description: string = 'Manual top-up'
) {
  if (amount <= 0) {
    throw new AppError('Amount must be positive', 400);
  }

  const prisma = getPrisma();

  await prisma.user.update({
    where: { id: userId },
    data: { balance: { increment: amount } },
  });

  await prisma.transaction.create({
    data: {
      userId,
      amount,
      type: 'CREDIT',
      description,
    },
  });

  logger.info(`Added ${amount} to user ${userId}: ${description}`);
}

export async function banUser(
  userId: string,
  reason: string,
  adminId: string,
  durationHours?: number
) {
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.role === 'SUPER_ADMIN') {
    throw new AppError('Cannot ban super admin', 403);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      isBanned: true,
      banReason: reason,
      bannedUntil: durationHours
        ? new Date(Date.now() + durationHours * 3600000)
        : null,
    },
  });

  await prisma.ban.create({
    data: {
      userId,
      type: durationHours ? 'TEMP' : 'PERMANENT',
      reason,
      expiresAt: durationHours
        ? new Date(Date.now() + durationHours * 3600000)
        : null,
    },
  });

  // Revoke all tokens
  await revokeAllUserTokens(userId);

  // Cache ban in Redis
  const redis = getRedis();
  if (durationHours) {
    await redis.setex(`ban:${userId}`, durationHours * 3600, reason);
  } else {
    await redis.set(`ban:${userId}`, reason);
  }

  logger.warn(`User ${userId} banned by admin ${adminId}: ${reason}`);

  return { success: true };
}

export async function unbanUser(userId: string, adminId: string) {
  const prisma = getPrisma();

  await prisma.user.update({
    where: { id: userId },
    data: {
      isBanned: false,
      banReason: null,
      bannedUntil: null,
    },
  });

  // Remove ban from Redis
  const redis = getRedis();
  await redis.del(`ban:${userId}`);

  logger.info(`User ${userId} unbanned by admin ${adminId}`);

  return { success: true };
}
