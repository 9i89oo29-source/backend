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
// Routes will be imported later
// import { apiRoutes } from './api/routes';

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Fingerprint'],
  credentials: true,
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Request logging
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Global rate limiter (will be refined per route later)
app.use(rateLimiter);

// Health check (basic)
app.get('/health', (_req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes will be mounted here later
// app.use('/api/v1', apiRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.warn(`Received ${signal}. Shutting down gracefully...`);
  try {
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

// Start server only if not in test environment
if (env.NODE_ENV !== 'test') {
  // Initialize connections then start listening
  getPrisma();
  getRedis();
  
  app.listen(env.PORT, () => {
    logger.info(`🚀 ${env.APP_NAME} backend running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  });
}

export { app };
