import { Scenes, Markup } from 'telegraf';
import { OrderService } from '../../services/order.service';
import { providerManager } from '../../app';

const orderService = new OrderService(providerManager);

export async function cancelCommand(ctx: Scenes.SceneContext) {
  const t = (ctx as any).t;
  const user = (ctx as any).user;
  if (!user) return;

  const args = (ctx.message as any)?.text?.split(' ') || [];
  const orderId = args[1];

  if (!orderId) {
    return ctx.reply('ℹ️ استخدم الأمر بهذا الشكل:\n/cancel <معرف_الطلب>\nمثال: /cancel abc123');
  }

  try {
    await orderService.cancelOrder(orderId, user.id);
    await ctx.reply(t('cancelled'));
  } catch (error: any) {
    await ctx.reply('❌ ' + error.message);
  }
}
