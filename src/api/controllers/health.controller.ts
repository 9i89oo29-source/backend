import { Request, Response, NextFunction } from 'express';
import { getPrisma } from '../../database/prisma';
import { getRedis } from '../../database/redis';
import { logger } from '../../utils/logger';

export class HealthController {
  async getHealth(req: Request, res: Response, next: NextFunction) {
    const checks: Record<string, { status: string; latency?: number; message?: string }> = {};

    // PostgreSQL
    try {
      const start = Date.now();
      await getPrisma().$queryRaw`SELECT 1`;
      checks.database = { status: 'healthy', latency: Date.now() - start };
    } catch (error: any) {
      checks.database = { status: 'unhealthy', message: error.message };
    }

    // Redis
    try {
      const start = Date.now();
      const redis = getRedis();
      await redis.ping();
      checks.redis = { status: 'healthy', latency: Date.now() - start };
    } catch (error: any) {
      checks.redis = { status: 'unhealthy', message: error.message };
    }

    // Providers will be added via provider manager later

    const overall = Object.values(checks).every((c) => c.status === 'healthy')
      ? 'healthy'
      : 'degraded';

    res.status(overall === 'healthy' ? 200 : 503).json({
      status: overall,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
    });
  }
}
