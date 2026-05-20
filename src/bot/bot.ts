import { Telegraf, Scenes, session } from 'telegraf';
import RedisSession from 'telegraf-session-redis';
import { env } from '../config/env';
import { getRedis } from '../database/redis';
import { logger } from '../utils/logger';
import { authMiddleware } from './middlewares/auth.middleware';
import { i18nMiddleware } from './middlewares/i18n.middleware';
import { buyScene } from './scenes/buy.scene';
import { settingsScene } from './scenes/settings.scene';
import { startCommand } from './commands/start.command';
import { balanceCommand } from './commands/balance.command';
import { ordersCommand } from './commands/orders.command';
import { cancelCommand } from './commands/cancel.command';
import { buyCommand } from './commands/buy.command';
import { supportCommand } from './commands/support.command';
import { adminCommands } from './commands/admin.commands';

const redis = getRedis();

// Session store in Redis
const sessionMiddleware = new RedisSession({
  store: {
    host: new URL(env.REDIS_URL).hostname,
    port: parseInt(new URL(env.REDIS_URL).port || '6379'),
    password: env.REDIS_PASSWORD || undefined,
  },
  ttl: 86400, // 1 day
});

// Scene registration
const stage = new Scenes.Stage([buyScene, settingsScene]);

export const bot = new Telegraf<Scenes.SceneContext>(env.TELEGRAM_BOT_TOKEN);

// Middlewares order matters
bot.use(sessionMiddleware);
bot.use(stage.middleware());
bot.use(authMiddleware);
bot.use(i18nMiddleware);

// Commands
bot.start(startCommand);
bot.command('balance', balanceCommand);
bot.command('orders', ordersCommand);
bot.command('cancel', cancelCommand);
bot.command('buy', buyCommand);
bot.command('support', supportCommand);

// Admin commands (registered via admin module)
adminCommands(bot);

// Error handling
bot.catch((err, ctx) => {
  logger.error('Telegram bot error', err);
  ctx.reply('⚠️ An unexpected error occurred. Please try again later.').catch(() => {});
});

// Start bot
export async function startBot() {
  try {
    await bot.launch();
    logger.info('🤖 Telegram bot started');
  } catch (error) {
    logger.fatal('Failed to start Telegram bot', error);
    throw error;
  }
}

export async function stopBot() {
  try {
    await bot.stop();
    logger.info('Telegram bot stopped');
  } catch (error) {
    logger.error('Error stopping Telegram bot', error);
  }
}
