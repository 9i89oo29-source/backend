import { Scenes } from 'telegraf';
import { getPrisma } from '../../database/prisma';
import { logger } from '../../utils/logger';

export async function authMiddleware(ctx: Scenes.SceneContext, next: () => Promise<void>) {
  if (!ctx.from) {
    return next();
  }

  try {
    const prisma = getPrisma();
    const telegramId = BigInt(ctx.from.id);

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          username: ctx.from.username || undefined,
          firstName: ctx.from.first_name || undefined,
          lastName: ctx.from.last_name || undefined,
          languageCode: ctx.from.language_code || 'ar',
          role: 'USER',
        },
      });
      logger.info(`New Telegram user created: ${telegramId} (${ctx.from.first_name})`);
    } else {
      // Update info
      await prisma.user.update({
        where: { telegramId },
        data: {
          username: ctx.from.username || undefined,
          firstName: ctx.from.first_name || undefined,
          lastName: ctx.from.last_name || undefined,
          languageCode: ctx.from.language_code || user.languageCode,
        },
      });
    }

    // Attach user to context
    (ctx as any).user = {
      id: user.id,
      telegramId: Number(user.telegramId),
      role: user.role,
      balance: Number(user.balance),
      subscription: user.subscription,
      isBanned: user.isBanned,
      banReason: user.banReason,
      languageCode: user.languageCode,
    };

    // Check if banned
    if (user.isBanned) {
      return ctx.reply(
        `🚫 Your account has been banned.\nReason: ${user.banReason || 'No reason provided'}\n\nContact support if you believe this is a mistake.`
      );
    }
  } catch (error) {
    logger.error('Auth middleware error', error);
  }

  return next();
}
