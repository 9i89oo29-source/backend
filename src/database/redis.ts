import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

let redis: Redis;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      password: env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 10) {
          logger.error('❌ Redis retry limit exceeded');
          return null; // stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redis.on('connect', () => logger.info('🟢 Redis connected'));
    redis.on('error', (err) => logger.error('Redis error', err));
    redis.on('close', () => logger.warn('Redis connection closed'));

    redis.connect().catch((err) => {
      logger.fatal('❌ Failed to connect to Redis', err);
      process.exit(1);
    });
  }
  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    logger.info('Disconnected from Redis');
  }
}
