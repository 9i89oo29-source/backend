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
import { SmsPollerWorker } from './workers/smsPoller.worker';
import { ExpirationWorker } from './workers/expiration.worker';
import { HealthCheckWorker } from './workers/healthCheck.worker';
import { startBot, stopBot } from './bot/bot';

// تصدير مدير المزوّدين لاستخدامه في الخدمات والتحكمات
export const providerManager = new ProviderManager();

const app = express();

// الأمان
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Fingerprint'],
  credentials: true,
}));

// ضغط الاستجابات
app.use(compression());

// تحليل جسم الطلبات
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// تسجيل الطلبات
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// تحديد المعدّل العام (سيتم تخصيصه لاحقًا لكل مسار إن لزم)
app.use(rateLimiter);

// تجميع كل مسارات API
app.use(apiRouter);

// معالج الأخطاء العام (يجب أن يكون آخر middleware)
app.use(errorHandler);

// ============ بدء التشغيل ============
if (env.NODE_ENV !== 'test') {
  (async () => {
    try {
      // تهيئة قواعد البيانات
      getPrisma();
      getRedis();

      // تحميل المزوّدين من قاعدة البيانات
      await providerManager.initializeAllFromDatabase();
      logger.info('✅ Provider manager initialized');

      // تشغيل العمال
      const smsPoller = new SmsPollerWorker(providerManager);
      const expiration = new ExpirationWorker();
      const healthCheck = new HealthCheckWorker(providerManager);

      smsPoller.start();
      expiration.start();
      healthCheck.start();
      logger.info('⚙️  Background workers started');

      // تشغيل بوت تيليجرام
      await startBot();

      // بدء الاستماع على المنفذ
      const server = app.listen(env.PORT, () => {
        logger.info(`🚀 ${env.APP_NAME} backend running on port ${env.PORT} in ${env.NODE_ENV} mode`);
      });

      // ============ الإيقاف الآمن ============
      async function gracefulShutdown(signal: string) {
        logger.warn(`🛑 Received ${signal}. Shutting down gracefully...`);
        try {
          smsPoller.stop();
          expiration.stop();
          healthCheck.stop();
          logger.info('Workers stopped');

          await stopBot();
          await providerManager.shutdownAll();
          await disconnectRedis();
          await disconnectPrisma();

          server.close(() => {
            logger.info('HTTP server closed');
            process.exit(0);
          });
        } catch (err) {
          logger.error('Error during shutdown', err);
          process.exit(1);
        }
      }

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    } catch (error) {
      logger.fatal('Initialization failed', error);
      process.exit(1);
    }
  })();
}

export { app };
