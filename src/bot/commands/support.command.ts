import { Scenes } from 'telegraf';

export async function supportCommand(ctx: Scenes.SceneContext) {
  const t = (ctx as any).t;
  await ctx.reply(t('support'));
}
