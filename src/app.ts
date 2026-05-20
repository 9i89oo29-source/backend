import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { env } from './config/env';
import { logger } from './utils/logger';
import { getPrisma, disconnectPrisma } from './database/prisma';
import { getRedis, disconnectRedis } from './database/redis';
import { errorHandler } from './api/middleware/errorHandler.middleware';
import { rateLimiter } from './api/middleware/rateLimiter.middleware';
import { ProviderManager } from './providers/providerManager';
import { apiRouter } from './api/routes';

// Initialize provider manager (export for DI)
export const providerManager = new ProviderManager();

const app = express();

app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Fingerprint'],
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

app.use(rateLimiter);

// Mount all API routes
app.use(apiRouter);

// Error handling
app.use(errorHandler);

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.warn(`Received ${signal}. Shutting down...`);
  try {
    await providerManager.shutdownAll();
    await disconnectRedis();
    await disconnectPrisma();
    logger.info('All connections closed');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
if (env.NODE_ENV !== 'test') {
  // Initialize connections and providers
  (async () => {
    try {
      getPrisma();
      getRedis();
      await providerManager.initializeAllFromDatabase();
      logger.info('Provider manager initialized');
    } catch (error) {
      logger.fatal('Initialization failed', error);
      process.exit(1);
    }

    app.listen(env.PORT, () => {
      logger.info(`🚀 ${env.APP_NAME} backend running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });
  })();
}

export { app };
