import { Scenes, Markup } from 'telegraf';

export const settingsScene = new Scenes.BaseScene<Scenes.SceneContext>('settings');

settingsScene.enter(async (ctx) => {
  await ctx.reply(
    '⚙️ الإعدادات:\nاختر اللغة / Choose language',
    Markup.inlineKeyboard([
      [Markup.button.callback('🇸🇦 العربية', 'lang_ar')],
      [Markup.button.callback('🇺🇸 English', 'lang_en')],
    ])
  );
});

settingsScene.action('lang_ar', async (ctx) => {
  const prisma = (await import('../../database/prisma')).getPrisma();
  const user = (ctx as any).user;
  if (user) {
    await prisma.user.update({ where: { id: user.id }, data: { languageCode: 'ar' } });
  }
  await ctx.editMessageText('تم تغيير اللغة إلى العربية.');
  await ctx.scene.leave();
});

settingsScene.action('lang_en', async (ctx) => {
  const prisma = (await import('../../database/prisma')).getPrisma();
  const user = (ctx as any).user;
  if (user) {
    await prisma.user.update({ where: { id: user.id }, data: { languageCode: 'en' } });
  }
  await ctx.editMessageText('Language changed to English.');
  await ctx.scene.leave();
});
