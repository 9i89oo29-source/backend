import { Markup } from 'telegraf';
import { ProviderService } from '../../services/provider.service';
import { providerManager } from '../../app';

const providerService = new ProviderService(providerManager);

export async function servicesKeyboard(providerSlug?: string) {
  const services = await providerService.getAvailableServices(providerSlug);

  const buttons = services.map((service) =>
    [Markup.button.callback(`${service.name} — ${service.price.toFixed(2)}$`, `service_${service.provider.slug}_${service.id}`)]
  );

  return Markup.inlineKeyboard(buttons);
}
