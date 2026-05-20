import { IProvider, ProviderHealthStatus } from './interface';
import { HeroSmsProvider } from './heroSms.provider';
import { TigerSmsProvider } from './tigerSms.provider';
import { getPrisma } from '../database/prisma';
import { getRedis } from '../database/redis';
import { logger } from '../utils/logger';

interface ProviderRecord {
  instance: IProvider;
  dbId: string;
  priority: number;
  isActive: boolean;
}

export class ProviderManager {
  private providers: Map<string, ProviderRecord> = new Map();
  private defaultProvider: string | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.registerBuiltInProviders();
  }

  private registerBuiltInProviders() {
    this.providers.set('hero-sms', {
      instance: new HeroSmsProvider(),
      dbId: '',
      priority: 1,
      isActive: false,
    });

    this.providers.set('tiger-sms', {
      instance: new TigerSmsProvider(),
      dbId: '',
      priority: 2,
      isActive: false,
    });
  }

  async initializeAllFromDatabase() {
    const prisma = getPrisma();
    const dbProviders = await prisma.provider.findMany({
      where: { isActive: true },
      orderBy: { priority: 'asc' },
    });

    for (const dbProvider of dbProviders) {
      const record = this.providers.get(dbProvider.slug);
      if (record) {
        record.dbId = dbProvider.id;
        record.priority = dbProvider.priority;
        record.isActive = dbProvider.isActive;

        await record.instance.initialize(
          dbProvider.apiKey,
          dbProvider.baseUrl,
          dbProvider.secret || undefined
        );

        logger.info(`[ProviderManager] Initialized ${dbProvider.name} (${dbProvider.slug})`);
      }
    }

    // Set default to highest priority active provider
    const firstActive = dbProviders[0];
    if (firstActive) {
      this.defaultProvider = firstActive.slug;
      logger.info(`[ProviderManager] Default provider: ${firstActive.name}`);
    }

    // Start health checks
    this.startHealthChecks();
  }

  getDefaultProvider(): IProvider {
    if (!this.defaultProvider) {
      throw new Error('No active provider configured');
    }
    const record = this.providers.get(this.defaultProvider);
    if (!record || !record.isActive) {
      return this.fallbackProvider();
    }
    return record.instance;
  }

  getProvider(slug: string): IProvider | undefined {
    const record = this.providers.get(slug);
    return record?.isActive ? record.instance : undefined;
  }

  getAllProviders(): IProvider[] {
    return Array.from(this.providers.values())
      .filter((r) => r.isActive)
      .map((r) => r.instance);
  }

  private fallbackProvider(): IProvider {
    // Find first active provider
    for (const [slug, record] of this.providers) {
      if (record.isActive) {
        logger.warn(`[ProviderManager] Falling back to ${slug}`);
        this.defaultProvider = slug;
        return record.instance;
      }
    }
    throw new Error('No active providers available');
  }

  private startHealthChecks() {
    this.healthCheckInterval = setInterval(async () => {
      for (const [slug, record] of this.providers) {
        if (!record.isActive) continue;
        try {
          const health = await record.instance.healthCheck();
          
          // Update provider status in Redis
          const redis = getRedis();
          await redis.set(
            `provider:health:${slug}`,
            JSON.stringify(health),
            'EX',
            120
          );

          // Update database lastCheck
          const prisma = getPrisma();
          await prisma.provider.update({
            where: { id: record.dbId },
            data: { lastCheck: new Date() },
          });

          if (health.status === ProviderHealthStatus.DOWN) {
            logger.error(`[ProviderManager] ${slug} is DOWN: ${health.message}`);
            // Trigger fallback if default is down
            if (this.defaultProvider === slug) {
              this.fallbackProvider();
            }
          }
        } catch (error: any) {
          logger.error(`[ProviderManager] Health check failed for ${slug}: ${error.message}`);
        }
      }
    }, 60000); // Every 60 seconds

    logger.info('[ProviderManager] Health checks started (every 60s)');
  }

  async shutdownAll() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    for (const [slug, record] of this.providers) {
      try {
        await record.instance.destroy();
        logger.info(`[ProviderManager] Shut down ${slug}`);
      } catch (error: any) {
        logger.error(`[ProviderManager] Error shutting down ${slug}: ${error.message}`);
      }
    }
  }
}
