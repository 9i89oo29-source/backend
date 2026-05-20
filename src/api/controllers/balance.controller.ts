import { Request, Response, NextFunction } from 'express';
import { getUserBalance } from '../../services/user.service';
import { AppError } from '../middleware/errorHandler.middleware';

export class BalanceController {
  async getBalance(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const balance = await getUserBalance(req.user.userId);

      res.status(200).json({
        status: 'success',
        data: balance,
      });
    } catch (error) {
      next(error);
    }
  }
}
