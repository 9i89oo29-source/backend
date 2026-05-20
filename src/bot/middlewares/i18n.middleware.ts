import { Scenes } from 'telegraf';
import { messages } from '../utils/messages';

export function i18nMiddleware(ctx: Scenes.SceneContext, next: () => Promise<void>) {
  const user = (ctx as any).user;
  const lang = user?.languageCode === 'ar' ? 'ar' : 'en';

  // Attach translation function
  (ctx as any).t = (key: string, replacements?: Record<string, string | number>) => {
    const msgSet = messages[lang] || messages.en;
    let text = msgSet[key] || messages.en[key] || key;
    if (replacements) {
      for (const [k, v] of Object.entries(replacements)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  };

  return next();
}
