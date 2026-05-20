import { Scenes } from 'telegraf';
import { OrderService } from '../../services/order.service';
import { providerManager } from '../../app';
import { formatCurrency, getOrderStatusEmoji, paginate } from '../utils/helpers';

const orderService = new OrderService(providerManager);

export async function ordersCommand(ctx: Scenes.SceneContext) {
  const t = (ctx as any).t;
  const user = (ctx as any).user;

  if (!user) return ctx.reply(t('admin_unauthorized'));

  try {
    const { orders } = await orderService.getUserOrders(user.id, 1, 5);

    if (!orders || orders.length === 0) {
      return ctx.reply(t('no_orders'));
    }

    const lines = orders.map((order: any, index: number) => {
      const emoji = getOrderStatusEmoji(order.status);
      const statusText = t(`order_status_${order.status.toLowerCase()}`) || order.status;
      return `${index + 1}. ${emoji} *${order.phoneNumber || '—'}*\n   ${order.serviceName} — ${statusText} — ${formatCurrency(order.price)} $`;
    });

    await ctx.replyWithMarkdown(
      `📋 *${t('order_list')}*\n\n${lines.join('\n\n')}`,
      { disable_web_page_preview: true }
    );
  } catch (error: any) {
    await ctx.reply('❌ ' + error.message);
  }
}
