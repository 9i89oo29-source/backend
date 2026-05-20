import { Scenes, Telegraf } from 'telegraf';
import { AdminController } from '../../api/controllers/admin.controller';
import { providerManager } from '../../app';

const adminController = new AdminController(providerManager);

export function adminCommands(bot: Telegraf<Scenes.SceneContext>) {
  bot.command('admin_stats', async (ctx) => {
    const user = (ctx as any).user;
    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) return;

    try {
      const req = {} as any;
      const res = {
        json: (data: any) => ctx.reply(JSON.stringify(data.data, null, 2)),
      } as any;
      await adminController.getStats(req, res, () => {});
    } catch (e: any) {
      ctx.reply('❌ ' + e.message);
    }
  });

  bot.command('admin_users', async (ctx) => {
    const user = (ctx as any).user;
    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) return;

    const args = (ctx.message as any)?.text?.split(' ') || [];
    const page = parseInt(args[1]) || 1;

    try {
      const req = { query: { page, limit: 10 } } as any;
      const res = {
        json: (data: any) => {
          const users = data.data.map((u: any) => `${u.firstName} (@${u.username || '—'}) — ${u.balance}$`).join('\n');
          ctx.reply(`👥 المستخدمون:\n${users}`);
        },
      } as any;
      await adminController.getUsers(req, res, () => {});
    } catch (e: any) {
      ctx.reply('❌ ' + e.message);
    }
  });

  // More admin commands as needed...
}
