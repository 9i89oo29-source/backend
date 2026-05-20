import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_NAME: z.string().default('TigerNumApp'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  REDIS_PASSWORD: z.string().optional(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('30d'),

  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),

  HERO_SMS_API_URL: z.string().url().optional(),
  HERO_SMS_API_KEY: z.string().optional(),
  HERO_SMS_API_SECRET: z.string().optional(),

  TIGER_SMS_API_URL: z.string().url().optional(),
  TIGER_SMS_API_KEY: z.string().optional(),
  TIGER_SMS_API_SECRET: z.string().optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_FILE: z.string().default('logs/app.log'),

  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  MAX_POLL_ATTEMPTS: z.coerce.number().int().positive().default(24),
  ORDER_EXPIRY_MINUTES: z.coerce.number().int().positive().default(20),

  CORS_ORIGIN: z.string().default('*'),
  ENCRYPTION_KEY: z.string().min(32),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
