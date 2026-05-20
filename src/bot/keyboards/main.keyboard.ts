import { Markup, Scenes } from 'telegraf';

export function mainKeyboard(ctx: Scenes.SceneContext) {
  const t = (ctx as any).t;
  return Markup.keyboard([
    [Markup.button.callback('🛒 شراء رقم', 'buy')],
    [Markup.button.callback('💰 رصيدي', 'balance'), Markup.button.callback('📋 طلباتي', 'orders')],
    [Markup.button.callback('🆘 دعم', 'support')],
  ]).resize();
}
