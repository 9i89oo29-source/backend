import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { deviceAuthSchema, refreshTokenSchema, linkDeviceSchema } from '../validators/auth.validator';

const router = Router();

// POST /api/v1/auth/device
router.post(
  '/device',
  validate(deviceAuthSchema, 'body'),
  authController.deviceAuth.bind(authController)
);

// POST /api/v1/auth/refresh
router.post(
  '/refresh',
  validate(refreshTokenSchema, 'body'),
  authController.refreshToken.bind(authController)
);

// POST /api/v1/auth/link-telegram
// Protected: requires valid JWT
router.post(
  '/link-telegram',
  authenticate,
  validate(linkDeviceSchema, 'body'),
  authController.linkTelegram.bind(authController)
);

export const authRoutes = router;
