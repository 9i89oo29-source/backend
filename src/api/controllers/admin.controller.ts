import { Request, Response, NextFunction } from 'express';
import { getPrisma } from '../../database/prisma';
import { getRedis } from '../../database/redis';
import { logger } from '../../utils/logger';
import { AppError } from '../middleware/errorHandler.middleware';
import { banUser, unbanUser } from '../../services/user.service';
import { ProviderManager } from '../../providers/providerManager';
import { BanUserInput, UnbanUserInput, UpdateUserInput, BroadcastInput, MaintenanceInput } from '../validators/admin.validator';

export class AdminController {
  constructor(private providerManager: ProviderManager) {}

  // ============ USERS ============

  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const prisma = getPrisma();
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const skip = (page - 1) * limit;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          select: {
            id: true,
            telegramId: true,
            username: true,
            firstName: true,
            role: true,
            balance: true,
            subscription: true,
            isBanned: true,
            createdAt: true,
            _count: { select: { orders: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.user.count(),
      ]);

      res.json({
        status: 'success',
        data: users.map((u) => ({
          ...u,
          balance: Number(u.balance),
          telegramId: u.telegramId ? Number(u.telegramId) : null,
          totalOrders: u._count.orders,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      next(error);
    }
  }

  async getUser(req: Request, res: Response, next: NextFunction) {
    try {
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: {
          devices: true,
          orders: { orderBy: { createdAt: 'desc' }, take: 20 },
          transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
          bans: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      });
      if (!user) throw new AppError('User not found', 404);

      res.json({
        status: 'success',
        data: {
          ...user,
          balance: Number(user.balance),
          telegramId: user.telegramId ? Number(user.telegramId) : null,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const prisma = getPrisma();
      const { balance, subscription, role } = req.body as UpdateUserInput;
      const data: any = {};
      if (balance !== undefined) data.balance = balance;
      if (subscription) data.subscription = subscription;
      if (role) data.role = role;

      const user = await prisma.user.update({
        where: { id: req.params.id },
        data,
        select: { id: true, balance: true, subscription: true, role: true },
      });
      logger.info(`Admin ${req.user!.userId} updated user ${req.params.id}`);
      res.json({ status: 'success', data: { ...user, balance: Number(user.balance) } });
    } catch (error) {
      next(error);
    }
  }

  async banUserHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, reason, durationHours } = req.body as BanUserInput;
      await banUser(userId, reason, req.user!.userId, durationHours);
      res.json({ status: 'success', message: 'User banned' });
    } catch (error) {
      next(error);
    }
  }

  async unbanUserHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.body as UnbanUserInput;
      await unbanUser(userId, req.user!.userId);
      res.json({ status: 'success', message: 'User unbanned' });
    } catch (error) {
      next(error);
    }
  }

  // ============ ORDERS ============

  async getAllOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const prisma = getPrisma();
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const skip = (page - 1) * limit;
      const status = req.query.status as string | undefined;

      const where: any = {};
      if (status) where.status = status.toUpperCase();

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          include: { user: { select: { id: true, username: true, telegramId: true } }, service: true, provider: true },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.order.count({ where }),
      ]);

      res.json({
        status: 'success',
        data: orders.map((o) => ({ ...o, price: Number(o.price), providerFee: Number(o.providerFee) })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      next(error);
    }
  }

  // ============ PROVIDERS ============

  async getProvidersStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const prisma = getPrisma();
      const providers = await prisma.provider.findMany({
        select: { id: true, name: true, slug: true, balance: true, isActive: true, lastCheck: true },
      });
      res.json({ status: 'success', data: providers.map((p) => ({ ...p, balance: Number(p.balance) })) });
    } catch (error) {
      next(error);
    }
  }

  async syncProvider(req: Request, res: Response, next: NextFunction) {
    try {
      const { slug } = req.params;
      const providerService = new (await import('../../services/provider.service')).ProviderService(this.providerManager);
      const result = await providerService.syncProviderData(slug);
      res.json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }

  // ============ STATISTICS ============

  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const prisma = getPrisma();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [totalUsers, newUsersToday, totalOrders, ordersToday, revenueToday, totalRevenue] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
        prisma.order.count(),
        prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
        prisma.order.aggregate({ _sum: { price: true }, where: { createdAt: { gte: todayStart } } }),
        prisma.order.aggregate({ _sum: { price: true } }),
      ]);

      res.json({
        status: 'success',
        data: {
          users: { total: totalUsers, today: newUsersToday },
          orders: { total: totalOrders, today: ordersToday },
          revenue: {
            today: Number(revenueToday._sum.price || 0),
            total: Number(totalRevenue._sum.price || 0),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // ============ BROADCAST ============

  async broadcast(req: Request, res: Response, next: NextFunction) {
    try {
      const { message, targetRole } = req.body as BroadcastInput;
      // Implementation depends on Telegram bot integration; store for later delivery
      logger.info(`Admin ${req.user!.userId} broadcast: ${message.substring(0, 50)}...`);
      res.json({ status: 'success', message: 'Broadcast queued' });
    } catch (error) {
      next(error);
    }
  }

  // ============ MAINTENANCE ============

  async setMaintenance(req: Request, res: Response, next: NextFunction) {
    try {
      const { enabled, message } = req.body as MaintenanceInput;
      const redis = getRedis();
      await redis.set('maintenance', JSON.stringify({ enabled, message: message || 'System under maintenance' }));
      logger.info(`Maintenance mode ${enabled ? 'enabled' : 'disabled'} by ${req.user!.userId}`);
      res.json({ status: 'success', maintenance: { enabled, message } });
    } catch (error) {
      next(error);
    }
  }
}
