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
import { Markup } from 'telegraf';

const redis = getRedis();

// إعداد جلسات Redis
const sessionMiddleware = new RedisSession({
  store: {
    host: new URL(env.REDIS_URL).hostname,
    port: parseInt(new URL(env.REDIS_URL).port || '6379'),
    password: env.REDIS_PASSWORD || undefined,
  },
  ttl: 86400, // يوم كامل
});

// تسجيل المشاهد (Scenes)
const stage = new Scenes.Stage([buyScene, settingsScene]);

export const bot = new Telegraf<Scenes.SceneContext>(env.TELEGRAM_BOT_TOKEN);

// Middlewares (الترتيب مهم)
bot.use(sessionMiddleware);
bot.use(stage.middleware());
bot.use(authMiddleware);
bot.use(i18nMiddleware);

// الأوامر الأساسية
bot.start(startCommand);
bot.command('balance', balanceCommand);
bot.command('orders', ordersCommand);
bot.command('cancel', cancelCommand);
bot.command('buy', buyCommand);
bot.command('support', supportCommand);

// أوامر المدير
adminCommands(bot);

// أزرار القائمة الرئيسية التفاعلية
bot.action('buy', buyCommand);
bot.action('balance', balanceCommand);
bot.action('orders', ordersCommand);
bot.action('support', supportCommand);

bot.action('main_menu', async (ctx) => {
  const t = (ctx as any).t;
  await ctx.editMessageText(t('welcome'));
  // استيراد لوحة المفاتيح الرئيسية لتحديث الأزرار
  const { mainKeyboard } = await import('./keyboards/main.keyboard');
  await ctx.editMessageReplyMarkup(mainKeyboard(ctx).reply_markup);
});

// معالج الأخطاء العام للبوت
bot.catch((err, ctx) => {
  logger.error('Telegram bot error', err);
  ctx.reply('⚠️ حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.').catch(() => {});
});

// دوال بدء وإيقاف البوت (تُستدعى من app.ts)
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
