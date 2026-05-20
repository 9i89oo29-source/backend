import { getPrisma } from '../database/prisma';
import { getRedis } from '../database/redis';
import { logger } from '../utils/logger';
import { ProviderManager } from '../providers/providerManager';

export class ProviderService {
  constructor(private providerManager: ProviderManager) {}

  async getAvailableServices(providerSlug?: string) {
    const prisma = getPrisma();

    const where: any = {
      isAvailable: true,
    };

    if (providerSlug) {
      where.provider = { slug: providerSlug, isActive: true };
    } else {
      where.provider = { isActive: true };
    }

    // Try Redis cache first
    const redis = getRedis();
    const cacheKey = `services:${providerSlug || 'all'}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const services = await prisma.service.findMany({
      where,
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: [{ provider: { priority: 'asc' } }, { name: 'asc' }],
    });

    const result = services.map((s) => ({
      id: s.providerServiceId,
      name: s.name,
      price: Number(s.price),
      available: s.isAvailable,
      provider: {
        id: s.provider.id,
        name: s.provider.name,
        slug: s.provider.slug,
      },
    }));

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(result));

    return result;
  }

  async getAvailableCountries() {
    const prisma = getPrisma();
    const redis = getRedis();

    const cacheKey = 'countries:all';
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const countries = await prisma.country.findMany({
      where: { isActive: true },
      orderBy: { nameAr: 'asc' },
    });

    const result = countries.map((c) => ({
      code: c.code,
      name: c.nameAr || c.name,
      flag: c.flag,
      dialCode: c.dialCode,
    }));

    // Cache for 10 minutes
    await redis.setex(cacheKey, 600, JSON.stringify(result));

    return result;
  }

  async getProviders() {
    const prisma = getPrisma();
    const redis = getRedis();

    const cacheKey = 'providers:all';
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const providers = await prisma.provider.findMany({
      where: { isActive: true },
      orderBy: { priority: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        priority: true,
        balance: true,
        lastCheck: true,
      },
    });

    const result = providers.map((p) => ({
      id: p.slug,
      name: p.name,
      slug: p.slug,
      priority: p.priority,
      balance: Number(p.balance),
      lastCheck: p.lastCheck,
    }));

    await redis.setex(cacheKey, 300, JSON.stringify(result));

    return result;
  }

  async syncProviderData(providerSlug: string) {
    const provider = this.providerManager.getProvider(providerSlug);
    if (!provider) {
      throw new Error(`Provider ${providerSlug} not found`);
    }

    const prisma = getPrisma();
    const redis = getRedis();

    // Sync services
    const rawServices = await provider.getServices();
    const dbProvider = await prisma.provider.findUnique({
      where: { slug: providerSlug },
    });

    if (!dbProvider) {
      throw new Error(`Provider ${providerSlug} not in database`);
    }

    for (const raw of rawServices) {
      await prisma.service.upsert({
        where: {
          providerId_providerServiceId: {
            providerId: dbProvider.id,
            providerServiceId: raw.id,
          },
        },
        update: {
          name: raw.name,
          price: raw.price,
          isAvailable: raw.available,
        },
        create: {
          providerId: dbProvider.id,
          providerServiceId: raw.id,
          name: raw.name,
          price: raw.price,
          isAvailable: raw.available,
        },
      });
    }

    // Sync balance
    const balanceData = await provider.getBalance();
    await prisma.provider.update({
      where: { id: dbProvider.id },
      data: {
        balance: balanceData.balance,
        lastCheck: new Date(),
      },
    });

    // Clear caches
    await redis.del(`services:${providerSlug}`);
    await redis.del('services:all');
    await redis.del('providers:all');

    logger.info(`Synced provider ${providerSlug}: ${rawServices.length} services`);

    return { services: rawServices.length, balance: balanceData.balance };
  }
}
