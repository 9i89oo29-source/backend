import { Scenes, Markup } from 'telegraf';
import { OrderService } from '../../services/order.service';
import { providerManager } from '../../app';
import { servicesKeyboard } from '../keyboards/services.keyboard';
import { countriesKeyboard } from '../keyboards/countries.keyboard';
import { providersKeyboard } from '../keyboards/providers.keyboard';

const orderService = new OrderService(providerManager);

export const buyScene = new Scenes.BaseScene<Scenes.SceneContext>('buy');

buyScene.enter(async (ctx) => {
  const t = (ctx as any).t;
  await ctx.reply(t('select_provider'), (await providersKeyboard()));
});

buyScene.action(/^provider_(.+)$/, async (ctx) => {
  const providerSlug = ctx.match[1];
  (ctx.scene as any).session.providerSlug = providerSlug;
  const t = (ctx as any).t;
  await ctx.editMessageText(t('select_service'));
  await ctx.editMessageReplyMarkup((await servicesKeyboard(providerSlug)).reply_markup);
});

buyScene.action(/^service_(.+)_(.+)$/, async (ctx) => {
  const providerSlug = ctx.match[1];
  const serviceId = ctx.match[2];
  (ctx.scene as any).session.serviceId = serviceId;
  (ctx.scene as any).session.providerSlug = providerSlug;
  const t = (ctx as any).t;
  await ctx.editMessageText(t('select_country'));
  await ctx.editMessageReplyMarkup((await countriesKeyboard()).reply_markup);
});

buyScene.action(/^country_(.+)$/, async (ctx) => {
  const countryCode = ctx.match[1];
  const { serviceId, providerSlug } = (ctx.scene as any).session;
  const t = (ctx as any).t;
  const user = (ctx as any).user;

  await ctx.editMessageText(t('buying'));

  try {
    const order = await orderService.createOrder({
      userId: user.id,
      deviceFingerprint: 'telegram', // Telegram users have a virtual fingerprint
      serviceId,
      countryCode,
      providerSlug,
    });

    await ctx.editMessageText(
      t('buy_success', { phone: order.phoneNumber, orderId: order.id })
    );
  } catch (error: any) {
    await ctx.editMessageText(t('buy_error') + '\n' + error.message);
  }

  await ctx.scene.leave();
});
