import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.middleware';

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    return next(new AppError('Admin access required', 403));
  }

  next();
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  if (req.user.role !== 'SUPER_ADMIN') {
    return next(new AppError('Super admin access required', 403));
  }

  next();
}
