import { Markup } from 'telegraf';
import { ProviderService } from '../../services/provider.service';
import { providerManager } from '../../app';

const providerService = new ProviderService(providerManager);

export async function countriesKeyboard() {
  const countries = await providerService.getAvailableCountries();

  const buttons = countries.slice(0, 50).map((country) =>
    [Markup.button.callback(`${country.flag} ${country.name} (${country.dialCode})`, `country_${country.code}`)]
  );

  return Markup.inlineKeyboard(buttons);
}
