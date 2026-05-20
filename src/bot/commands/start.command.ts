import { Scenes } from 'telegraf';
import { mainKeyboard } from '../keyboards/main.keyboard';

export async function startCommand(ctx: Scenes.SceneContext) {
  const t = (ctx as any).t;

  await ctx.reply(t('welcome'), mainKeyboard(ctx));
}
