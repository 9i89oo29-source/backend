import { getPrisma } from '../database/prisma';
import { getRedis } from '../database/redis';
import { logger } from '../utils/logger';

export class ExpirationWorker {
  private interval: NodeJS.Timeout | null = null;
  private isRunning = false;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('⌛ Expiration worker started');

    this.check();

    this.interval = setInterval(() => {
      this.check();
    }, 30000); // Every 30 seconds
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    logger.info('⌛ Expiration worker stopped');
  }

  private async check() {
    const prisma = getPrisma();
    const redis = getRedis();
    const lockKey = 'worker:expiration:lock';
    
    const acquired = await redis.set(lockKey, 'locked', 'NX', 'EX', 25);
    if (!acquired) return;

    try {
      // Find orders that have passed their expiration date and are still PENDING
      const expiredOrders = await prisma.order.updateMany({
        where: {
          status: 'PENDING',
          expiresAt: { lte: new Date() },
        },
        data: {
          status: 'EXPIRED',
        },
      });

      if (expiredOrders.count > 0) {
        logger.info(`⌛ Expired ${expiredOrders.count} orders`);

        // Clear Redis cache for expired orders
        const expiredOrdersList = await prisma.order.findMany({
          where: {
            status: 'EXPIRED',
            expiresAt: { lte: new Date() },
          },
          select: { id: true },
          take: 100,
        });

        for (const order of expiredOrdersList) {
          await redis.del(`order:${order.id}:status`).catch(() => {});
          await redis.del(`order:${order.id}:sms`).catch(() => {});
        }
      }

      // Also handle orders that reached max retries without result
      const { env } = await import('../config/env');
      const maxedOutOrders = await prisma.order.updateMany({
        where: {
          status: 'PENDING',
          retryCount: { gte: env.MAX_POLL_ATTEMPTS },
        },
        data: {
          status: 'EXPIRED',
        },
      });

      if (maxedOutOrders.count > 0) {
        logger.info(`⌛ Expired ${maxedOutOrders.count} orders due to max retries`);
      }
    } catch (error: any) {
      logger.error('Expiration worker error', error);
    } finally {
      await redis.del(lockKey).catch(() => {});
    }
  }
}
