import { Markup } from 'telegraf';
import { ProviderService } from '../../services/provider.service';
import { providerManager } from '../../app';

const providerService = new ProviderService(providerManager);

export async function providersKeyboard() {
  const providers = await providerService.getProviders();

  const buttons = providers.map((provider) =>
    [Markup.button.callback(provider.name, `provider_${provider.slug}`)]
  );

  return Markup.inlineKeyboard(buttons);
}
