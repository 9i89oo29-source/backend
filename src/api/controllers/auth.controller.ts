import { Request, Response, NextFunction } from 'express';
import {
  authenticateDevice,
  refreshAccessToken,
  linkTelegramToDevice,
} from '../../services/auth.service';
import { DeviceAuthInput, LinkDeviceInput, RefreshTokenInput } from '../validators/auth.validator';
import { AppError } from '../middleware/errorHandler.middleware';
import { logger } from '../../utils/logger';

export class AuthController {
  /**
   * POST /api/v1/auth/device
   * Body: { fingerprint, deviceId?, appSignature?, installTimestamp?, platform?, model? }
   */
  async deviceAuth(req: Request, res: Response, next: NextFunction) {
    try {
      const deviceData = req.body as DeviceAuthInput;
      const result = await authenticateDevice(deviceData);
      
      res.status(200).json({
        status: 'success',
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
          device: result.device,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/refresh
   * Body: { refreshToken }
   * Headers: X-Device-Fingerprint
   */
  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body as RefreshTokenInput;
      const deviceFingerprint = req.headers['x-device-fingerprint'] as string;

      if (!deviceFingerprint) {
        throw new AppError('Missing X-Device-Fingerprint header', 400);
      }

      const tokens = await refreshAccessToken(refreshToken, deviceFingerprint);

      res.status(200).json({
        status: 'success',
        data: tokens,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/link-telegram
   * Body: { telegramId, username?, firstName?, lastName? }
   * Headers: Authorization Bearer <accessToken>
   *          X-Device-Fingerprint
   */
  async linkTelegram(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const { telegramId, username, firstName, lastName } = req.body as LinkDeviceInput & {
        username?: string;
        firstName?: string;
        lastName?: string;
      };

      if (!telegramId) {
        throw new AppError('telegramId is required', 400);
      }

      const user = await linkTelegramToDevice(
        req.user.fingerprint,
        BigInt(telegramId),
        username,
        firstName,
        lastName
      );

      res.status(200).json({
        status: 'success',
        data: {
          id: user.id,
          telegramId: user.telegramId ? Number(user.telegramId) : null,
          username: user.username,
          firstName: user.firstName,
          role: user.role,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
