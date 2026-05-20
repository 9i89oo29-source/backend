import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../utils/logger';

let prisma: PrismaClient;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: env.NODE_ENV === 'development' 
        ? ['query', 'info', 'warn', 'error'] 
        : ['error'],
    });

    prisma.$connect()
      .then(() => logger.info('📦 Connected to PostgreSQL via Prisma'))
      .catch((err) => {
        logger.fatal('❌ Failed to connect to PostgreSQL', err);
        process.exit(1);
      });
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Disconnected from PostgreSQL');
  }
}
