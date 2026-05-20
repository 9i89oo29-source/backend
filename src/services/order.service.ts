import { getPrisma } from '../database/prisma';
import { getRedis } from '../database/redis';
import { logger } from '../utils/logger';
import { ProviderManager } from '../providers/providerManager';
import { OrderStatus } from '@prisma/client';
import { AppError } from '../api/middleware/errorHandler.middleware';
import { detectAbusePattern } from '../security/antiAbuse';

interface CreateOrderParams {
  userId: string;
  deviceFingerprint: string;
  providerSlug?: string;
  serviceId: string;
  countryCode: string;
}

interface OrderResult {
  id: string;
  externalOrderId: string | null;
  phoneNumber: string | null;
  status: OrderStatus;
  serviceName: string;
  countryName: string;
  providerName: string;
  price: number;
  expiresAt: Date | null;
}

export class OrderService {
  constructor(private providerManager: ProviderManager) {}

  async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    const { userId, serviceId, countryCode, providerSlug } = params;
    const prisma = getPrisma();

    // 1. Check abuse
    const abuseReason = await detectAbusePattern(userId);
    if (abuseReason) {
      logger.warn(`Abuse detected for user ${userId}: ${abuseReason}`);
      throw new AppError('Order blocked due to suspicious activity', 429);
    }

    // 2. Get provider
    const provider = providerSlug
      ? this.providerManager.getProvider(providerSlug)
      : this.providerManager.getDefaultProvider();

    if (!provider) {
      throw new AppError('No active provider available', 503);
    }

    // 3. Get user balance
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true, subscription: true },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // 4. Get service price
    const dbService = await prisma.service.findFirst({
      where: {
        providerServiceId: serviceId,
        provider: { slug: provider.slug },
      },
      include: { provider: true },
    });

    if (!dbService || !dbService.isAvailable) {
      throw new AppError('Service not available', 400);
    }

    const price = Number(dbService.price);

    // 5. Check balance
    if (Number(user.balance) < price) {
      throw new AppError('Insufficient balance', 402);
    }

    // 6. Get country
    const dbCountry = await prisma.country.findUnique({
      where: { code: countryCode },
    });

    if (!dbCountry) {
      throw new AppError('Country not supported', 400);
    }

    // 7. Buy number from provider
    try {
      const buyResult = await provider.buyNumber(serviceId, countryCode);

      // 8. Deduct balance
      await prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: price } },
      });

      // 9. Record transaction
      await prisma.transaction.create({
        data: {
          userId,
          amount: -price,
          type: 'PURCHASE',
          description: `Purchase ${dbService.name} (${dbCountry.name}) via ${provider.name}`,
          reference: buyResult.orderId,
        },
      });

      // 10. Create order in database
      const order = await prisma.order.create({
        data: {
          userId,
          serviceId: dbService.id,
          countryId: dbCountry.id,
          providerId: dbService.providerId,
          externalOrderId: buyResult.orderId,
          phoneNumber: buyResult.phoneNumber,
          status: 'PENDING',
          price,
          providerFee: 0,
          expiresAt: buyResult.expiresAt
            ? new Date(buyResult.expiresAt)
            : new Date(Date.now() + 20 * 60000), // 20 minutes default
        },
        include: {
          service: { include: { provider: true } },
          country: true,
        },
      });

      // 11. Cache order status in Redis for fast polling
      const redis = getRedis();
      await redis.setex(
        `order:${order.id}:status`,
        3600,
        'PENDING'
      );

      logger.info(
        `Order created: ${order.id} (${provider.name}) phone=${buyResult.phoneNumber}`
      );

      return {
        id: order.id,
        externalOrderId: order.externalOrderId,
        phoneNumber: order.phoneNumber,
        status: order.status,
        serviceName: order.service.name,
        countryName: order.country.nameAr || order.country.name,
        providerName: order.service.provider.name,
        price,
        expiresAt: order.expiresAt,
      };
    } catch (error: any) {
      logger.error(`Failed to create order via ${provider.name}: ${error.message}`);
      throw new AppError(
        error.message || 'Failed to purchase number',
        502
      );
    }
  }

  async getOrderById(orderId: string, userId: string): Promise<any> {
    const prisma = getPrisma();

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        service: true,
        country: true,
        provider: true,
        smsMessages: {
          orderBy: { receivedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    return {
      id: order.id,
      externalOrderId: order.externalOrderId,
      phoneNumber: order.phoneNumber,
      status: order.status,
      smsCode: order.smsCode,
      serviceName: order.service.name,
      countryName: order.country.nameAr || order.country.name,
      countryFlag: order.country.flag,
      providerName: order.provider.name,
      price: Number(order.price),
      expiresAt: order.expiresAt,
      createdAt: order.createdAt,
      smsReceivedAt: order.smsReceivedAt,
      lastSms: order.smsMessages[0] || null,
    };
  }

  async getUserOrders(userId: string, page = 1, limit = 20): Promise<any> {
    const prisma = getPrisma();
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId },
        include: {
          service: true,
          country: true,
          provider: true,
          smsMessages: {
            orderBy: { receivedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({ where: { userId } }),
    ]);

    return {
      orders: orders.map((order) => ({
        id: order.id,
        externalOrderId: order.externalOrderId,
        phoneNumber: order.phoneNumber,
        status: order.status,
        smsCode: order.smsCode,
        serviceName: order.service.name,
        countryName: order.country.nameAr || order.country.name,
        countryFlag: order.country.flag,
        providerName: order.provider.name,
        price: Number(order.price),
        expiresAt: order.expiresAt,
        createdAt: order.createdAt,
        smsReceivedAt: order.smsReceivedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async cancelOrder(orderId: string, userId: string): Promise<boolean> {
    const prisma = getPrisma();

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { provider: true },
    });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    if (order.status !== 'PENDING') {
      throw new AppError('Order cannot be cancelled', 400);
    }

    // Try to cancel at provider
    const provider = this.providerManager.getProvider(order.provider.slug);
    if (provider && order.externalOrderId) {
      try {
        await provider.cancelOrder(order.externalOrderId);
      } catch (error: any) {
        logger.warn(`Provider cancel failed for order ${orderId}: ${error.message}`);
      }
    }

    // Update order status
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    // Refund 50% (configurable)
    const refundAmount = Number(order.price) * 0.5;
    if (refundAmount > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: refundAmount } },
      });

      await prisma.transaction.create({
        data: {
          userId,
          amount: refundAmount,
          type: 'REFUND',
          description: `Refund for cancelled order ${orderId}`,
          reference: orderId,
        },
      });
    }

    // Update Redis
    const redis = getRedis();
    await redis.setex(`order:${orderId}:status`, 3600, 'CANCELLED');

    logger.info(`Order ${orderId} cancelled by user ${userId}`);

    return true;
  }

  async pollOrderSms(orderId: string, userId: string): Promise<any> {
    const prisma = getPrisma();
    const redis = getRedis();

    // Check Redis cache first
    const cachedStatus = await redis.get(`order:${orderId}:status`);
    if (cachedStatus === 'RECEIVED') {
      const cachedSms = await redis.get(`order:${orderId}:sms`);
      if (cachedSms) {
        return JSON.parse(cachedSms);
      }
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { provider: true },
    });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    if (order.status === 'RECEIVED' || order.status === 'EXPIRED' || order.status === 'CANCELLED') {
      return {
        orderId,
        status: order.status,
        smsCode: order.smsCode,
        smsReceivedAt: order.smsReceivedAt,
      };
    }

    // Check expiration
    if (order.expiresAt && new Date() > order.expiresAt) {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'EXPIRED' },
      });
      return { orderId, status: 'EXPIRED' };
    }

    // Poll provider
    const provider = this.providerManager.getProvider(order.provider.slug);
    if (!provider || !order.externalOrderId) {
      return { orderId, status: order.status };
    }

    try {
      const smsResult = await provider.getSms(order.externalOrderId);

      if (smsResult.status === 'RECEIVED' && smsResult.smsCode) {
        // Update order
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: 'RECEIVED',
            smsCode: smsResult.smsCode,
            smsReceivedAt: smsResult.receivedAt
              ? new Date(smsResult.receivedAt)
              : new Date(),
            lastPollAt: new Date(),
          },
        });

        // Store SMS message
        await prisma.smsMessage.create({
          data: {
            orderId,
            sender: smsResult.sender || 'unknown',
            message: smsResult.message || smsResult.smsCode || '',
            code: smsResult.smsCode,
            receivedAt: smsResult.receivedAt
              ? new Date(smsResult.receivedAt)
              : new Date(),
          },
        });

        // Cache in Redis
        await redis.setex(`order:${orderId}:status`, 3600, 'RECEIVED');
        await redis.setex(
          `order:${orderId}:sms`,
          3600,
          JSON.stringify({
            orderId,
            status: 'RECEIVED',
            smsCode: smsResult.smsCode,
            smsReceivedAt: new Date().toISOString(),
          })
        );

        logger.info(`SMS received for order ${orderId}: ${smsResult.smsCode}`);

        return {
          orderId,
          status: 'RECEIVED' as const,
          smsCode: smsResult.smsCode,
          smsReceivedAt: new Date().toISOString(),
        };
      }

      if (smsResult.status === 'EXPIRED') {
        await prisma.order.update({
          where: { id: orderId },
          data: { status: 'EXPIRED', lastPollAt: new Date() },
        });
        await redis.setex(`order:${orderId}:status`, 3600, 'EXPIRED');
        return { orderId, status: 'EXPIRED' };
      }

      // Still waiting
      await prisma.order.update({
        where: { id: orderId },
        data: { lastPollAt: new Date() },
      });

      return { orderId, status: order.status };
    } catch (error: any) {
      logger.error(`Poll failed for order ${orderId}: ${error.message}`);
      return { orderId, status: order.status };
    }
  }
}
