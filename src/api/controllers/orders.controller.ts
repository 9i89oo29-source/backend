import { Request, Response, NextFunction } from 'express';
import { OrderService } from '../../services/order.service';
import { logger } from '../../utils/logger';
import { AppError } from '../middleware/errorHandler.middleware';

export class OrdersController {
  constructor(private orderService: OrderService) {}

  /**
   * POST /api/v1/orders
   * Body: { serviceId, countryCode, providerSlug? }
   */
  async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const { serviceId, countryCode, providerSlug } = req.body;

      if (!serviceId || !countryCode) {
        throw new AppError('serviceId and countryCode are required', 400);
      }

      const order = await this.orderService.createOrder({
        userId: req.user.userId,
        deviceFingerprint: req.user.fingerprint,
        serviceId,
        countryCode,
        providerSlug,
      });

      res.status(201).json({
        status: 'success',
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/orders
   */
  async getUserOrders(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const orders = await this.orderService.getUserOrders(req.user.userId, page, limit);

      res.status(200).json({
        status: 'success',
        ...orders,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/orders/:id
   */
  async getOrder(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const { id } = req.params;
      const order = await this.orderService.getOrderById(id, req.user.userId);

      res.status(200).json({
        status: 'success',
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/orders/:id/poll
   */
  async pollOrder(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const { id } = req.params;
      const pollResult = await this.orderService.pollOrderSms(id, req.user.userId);

      res.status(200).json({
        status: 'success',
        data: pollResult,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/orders/:id/cancel
   */
  async cancelOrder(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const { id } = req.params;
      const result = await this.orderService.cancelOrder(id, req.user.userId);

      res.status(200).json({
        status: 'success',
        message: 'Order cancelled',
      });
    } catch (error) {
      next(error);
    }
  }
}
