import pino from 'pino';
import { env } from '../config/env';

const transport = env.NODE_ENV === 'development'
  ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
  : undefined;

export const logger = pino({
  level: env.LOG_LEVEL,
  name: env.APP_NAME,
  transport,
  ...(env.NODE_ENV === 'production' && {
    file: env.LOG_FILE,
  }),
});
