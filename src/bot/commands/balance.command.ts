import { Scenes } from 'telegraf';
import { getUserBalance } from '../../services/user.service';

export async function balanceCommand(ctx: Scenes.SceneContext) {
  const t = (ctx as any).t;
  const user = (ctx as any).user;

  if (!user) {
    return ctx.reply(t('admin_unauthorized'));
  }

  try {
    const { balance } = await getUserBalance(user.id);
    await ctx.reply(t('balance', { balance: balance.toFixed(2) }));
  } catch (error: any) {
    await ctx.reply('❌ ' + error.message);
  }
}
