import { getPrisma } from '../database/prisma';
import { getRedis } from '../database/redis';
import { logger } from '../utils/logger';
import { ProviderManager } from '../providers/providerManager';
import { OrderStatus } from '@prisma/client';
import { env } from '../config/env';

export class SmsPollerWorker {
  private interval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private providerManager: ProviderManager) {}

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('📬 SMS Poller worker started');

    this.poll();

    this.interval = setInterval(() => {
      this.poll();
    }, env.POLL_INTERVAL_MS);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    logger.info('📬 SMS Poller worker stopped');
  }

  private async poll() {
    const prisma = getPrisma();
    const redis = getRedis();
    const lockKey = 'worker:sms_poller:lock';
    
    // Use Redis lock to prevent duplicate processing in cluster mode
    const acquired = await redis.set(lockKey, 'locked', 'NX', 'EX', 10);
    if (!acquired) {
      return; // Another instance is already processing
    }

    try {
      const pendingOrders = await prisma.order.findMany({
        where: {
          status: 'PENDING',
          expiresAt: { gt: new Date() },
          retryCount: { lt: env.MAX_POLL_ATTEMPTS },
        },
        include: { provider: true },
        take: 50, // Process in batches
        orderBy: { lastPollAt: { sort: 'asc', nulls: 'first' } },
      });

      if (pendingOrders.length === 0) {
        return;
      }

      logger.debug(`Polling ${pendingOrders.length} pending orders`);

      for (const order of pendingOrders) {
        try {
          const provider = this.providerManager.getProvider(order.provider.slug);
          if (!provider || !order.externalOrderId) {
            continue;
          }

          const smsResult = await provider.getSms(order.externalOrderId);

          if (smsResult.status === 'RECEIVED' && smsResult.smsCode) {
            // Update order
            await prisma.order.update({
              where: { id: order.id },
              data: {
                status: 'RECEIVED',
                smsCode: smsResult.smsCode,
                smsReceivedAt: smsResult.receivedAt ? new Date(smsResult.receivedAt) : new Date(),
                lastPollAt: new Date(),
              },
            });

            // Store SMS message
            await prisma.smsMessage.create({
              data: {
                orderId: order.id,
                sender: smsResult.sender || 'unknown',
                message: smsResult.message || smsResult.smsCode || '',
                code: smsResult.smsCode,
                receivedAt: smsResult.receivedAt ? new Date(smsResult.receivedAt) : new Date(),
              },
            });

            // Cache in Redis
            await redis.setex(`order:${order.id}:status`, 3600, 'RECEIVED');
            await redis.setex(
              `order:${order.id}:sms`,
              3600,
              JSON.stringify({
                orderId: order.id,
                status: 'RECEIVED',
                smsCode: smsResult.smsCode,
                smsReceivedAt: new Date().toISOString(),
              })
            );

            logger.info(`📩 SMS received for order ${order.id}: ${smsResult.smsCode}`);

            // Notify user via Telegram if linked
            const user = await prisma.user.findUnique({
              where: { id: order.userId },
              select: { telegramId: true, languageCode: true },
            });

            if (user?.telegramId) {
              const { bot } = await import('../bot/bot');
              const lang = user.languageCode === 'ar' ? 'ar' : 'en';
              const msg = lang === 'ar'
                ? `📩 تم استلام رسالة!\nالرمز: ${smsResult.smsCode}\nللطلب: ${order.id}`
                : `📩 SMS received!\nCode: ${smsResult.smsCode}\nOrder: ${order.id}`;
              bot.telegram.sendMessage(Number(user.telegramId), msg).catch(() => {});
            }
          } else if (smsResult.status === 'EXPIRED') {
            await prisma.order.update({
              where: { id: order.id },
              data: { status: 'EXPIRED', lastPollAt: new Date() },
            });
            await redis.setex(`order:${order.id}:status`, 3600, 'EXPIRED');
            logger.info(`⌛ Order ${order.id} expired at provider`);
          } else {
            // Still waiting – update retry count and last poll time
            await prisma.order.update({
              where: { id: order.id },
              data: {
                lastPollAt: new Date(),
                retryCount: { increment: 1 },
              },
            });
          }
        } catch (error: any) {
          logger.error(`Poll error for order ${order.id}: ${error.message}`);
          // Increment retry count on error
          await prisma.order.update({
            where: { id: order.id },
            data: {
              lastPollAt: new Date(),
              retryCount: { increment: 1 },
            },
          }).catch(() => {});
        }
      }
    } catch (error: any) {
      logger.error('SMS Poller worker error', error);
    } finally {
      await redis.del(lockKey).catch(() => {});
    }
  }
}
