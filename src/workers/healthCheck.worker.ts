import { getPrisma } from '../database/prisma';
import { getRedis } from '../database/redis';
import { logger } from '../utils/logger';
import { ProviderManager } from '../providers/providerManager';

export class HealthCheckWorker {
  private interval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private providerManager: ProviderManager) {}

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('🏥 Health Check worker started');

    this.check();

    this.interval = setInterval(() => {
      this.check();
    }, 120000); // Every 2 minutes
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    logger.info('🏥 Health Check worker stopped');
  }

  private async check() {
    const prisma = getPrisma();
    const redis = getRedis();
    const lockKey = 'worker:health_check:lock';
    
    const acquired = await redis.set(lockKey, 'locked', 'NX', 'EX', 60);
    if (!acquired) return;

    try {
      const providers = await prisma.provider.findMany({
        where: { isActive: true },
      });

      for (const dbProvider of providers) {
        const provider = this.providerManager.getProvider(dbProvider.slug);
        if (!provider) continue;

        try {
          const health = await provider.healthCheck();

          // Store health status in Redis
          await redis.setex(
            `provider:health:${dbProvider.slug}`,
            300,
            JSON.stringify(health)
          );

          // Update last check time
          await prisma.provider.update({
            where: { id: dbProvider.id },
            data: { lastCheck: new Date() },
          });

          // Sync balance periodically
          if (Math.random() < 0.1) { // 10% chance each check to reduce API calls
            try {
              const balanceData = await provider.getBalance();
              await prisma.provider.update({
                where: { id: dbProvider.id },
                data: { balance: balanceData.balance },
              });
            } catch (e: any) {
              logger.warn(`Failed to sync balance for ${dbProvider.slug}: ${e.message}`);
            }
          }

          if (health.status === 'down') {
            logger.warn(`⚠️ Provider ${dbProvider.slug} is DOWN: ${health.message}`);
          }
        } catch (error: any) {
          logger.error(`Health check failed for ${dbProvider.slug}: ${error.message}`);
        }
      }
    } catch (error: any) {
      logger.error('Health Check worker error', error);
    } finally {
      await redis.del(lockKey).catch(() => {});
    }
  }
}
