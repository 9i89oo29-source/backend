import { getPrisma } from '../database/prisma';
import { logger } from '../utils/logger';
import { AppError } from '../api/middleware/errorHandler.middleware';
import { SubscriptionTier } from '@prisma/client';

interface TierConfig {
  maxOrdersPerDay: number;
  maxActiveOrders: number;
  discount: number; // percentage 0-100
  priority: number;
}

const TIER_LIMITS: Record<SubscriptionTier, TierConfig> = {
  FREE: {
    maxOrdersPerDay: 3,
    maxActiveOrders: 1,
    discount: 0,
    priority: 0,
  },
  BASIC: {
    maxOrdersPerDay: 10,
    maxActiveOrders: 3,
    discount: 5,
    priority: 1,
  },
  PREMIUM: {
    maxOrdersPerDay: 30,
    maxActiveOrders: 5,
    discount: 10,
    priority: 2,
  },
  ENTERPRISE: {
    maxOrdersPerDay: 100,
    maxActiveOrders: 20,
    discount: 20,
    priority: 3,
  },
};

export function getTierConfig(tier: SubscriptionTier): TierConfig {
  return TIER_LIMITS[tier] || TIER_LIMITS.FREE;
}

export async function checkOrderLimit(userId: string): Promise<void> {
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscription: true },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const config = getTierConfig(user.subscription);

  // Check daily orders
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayOrders = await prisma.order.count({
    where: {
      userId,
      createdAt: { gte: todayStart },
    },
  });

  if (todayOrders >= config.maxOrdersPerDay) {
    throw new AppError(
      `Daily order limit reached (${config.maxOrdersPerDay}). Upgrade your plan.`,
      429
    );
  }

  // Check active orders
  const activeOrders = await prisma.order.count({
    where: {
      userId,
      status: 'PENDING',
    },
  });

  if (activeOrders >= config.maxActiveOrders) {
    throw new AppError(
      `Active order limit reached (${config.maxActiveOrders}). Wait for current orders to complete.`,
      429
    );
  }
}

export async function upgradeSubscription(
  userId: string,
  tier: SubscriptionTier,
  adminId: string
) {
  const prisma = getPrisma();

  await prisma.user.update({
    where: { id: userId },
    data: { subscription: tier },
  });

  await prisma.subscription.upsert({
    where: { userId },
    update: {
      tier,
      startDate: new Date(),
      endDate: null,
      isActive: true,
    },
    create: {
      userId,
      tier,
      startDate: new Date(),
    },
  });

  logger.info(`User ${userId} upgraded to ${tier} by admin ${adminId}`);

  return { success: true, tier };
}

export function calculateDiscount(tier: SubscriptionTier, basePrice: number): number {
  const config = getTierConfig(tier);
  return basePrice * (1 - config.discount / 100);
}
