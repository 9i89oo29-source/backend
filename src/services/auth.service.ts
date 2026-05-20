import { getPrisma } from '../database/prisma';
import { getRedis } from '../database/redis';
import { logger } from '../utils/logger';
import {
  findOrCreateDevice,
  linkDeviceToUser,
  verifyFingerprintIntegrity,
  DeviceFingerprintInput,
} from '../security/deviceFingerprint';
import {
  generateAccessToken,
  generateRefreshToken,
  storeRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  JwtPayload,
} from '../security/jwt';
import {
  trackFailedAttempt,
  resetFailedAttempts,
  isDeviceBanned,
  checkDeviceThrottle,
} from '../security/antiAbuse';
import { AppError } from '../api/middleware/errorHandler.middleware';

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    telegramId: bigint | null;
    role: string;
    balance: number;
    subscription: string;
  };
  device: {
    fingerprint: string;
    isNew: boolean;
  };
}

export async function authenticateDevice(
  deviceData: DeviceFingerprintInput
): Promise<AuthResult> {
  if (!verifyFingerprintIntegrity(deviceData.fingerprint)) {
    throw new AppError('Invalid device fingerprint format', 400);
  }

  // Check if device is banned
  const isBanned = await isDeviceBanned(deviceData.fingerprint);
  if (isBanned) {
    throw new AppError('Device is banned', 403);
  }

  // Check throttle
  const throttled = await checkDeviceThrottle(deviceData.fingerprint);
  if (throttled) {
    throw new AppError('Too many requests from this device', 429);
  }

  try {
    // Find or create device
    const device = await findOrCreateDevice(deviceData.fingerprint, deviceData);
    const isNew = !device.userId;

    let user = device.user;

    // If device already linked, use that user
    if (!user) {
      // For new devices without Telegram, create a temporary user
      // In production, users link via Telegram bot
      const prisma = getPrisma();
      user = await prisma.user.create({
        data: {
          languageCode: 'ar',
          role: 'USER',
          devices: {
            connect: { fingerprint: deviceData.fingerprint },
          },
        },
      });
      await linkDeviceToUser(deviceData.fingerprint, user.id);
    }

    // Check if user is banned
    if (user.isBanned) {
      throw new AppError(
        user.banReason || 'Account is banned',
        403
      );
    }

    // Generate tokens
    const payload: JwtPayload = {
      userId: user.id,
      deviceId: deviceData.fingerprint,
      role: user.role,
      fingerprint: deviceData.fingerprint,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Store refresh token
    await storeRefreshToken(user.id, deviceData.fingerprint, refreshToken);

    // Reset failed attempts
    await resetFailedAttempts(deviceData.fingerprint, 'auth');

    logger.info(
      `Device authenticated: ${deviceData.fingerprint.substring(0, 16)}... (user: ${user.id}, new: ${isNew})`
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        telegramId: user.telegramId,
        role: user.role,
        balance: Number(user.balance),
        subscription: user.subscription,
      },
      device: {
        fingerprint: deviceData.fingerprint,
        isNew,
      },
    };
  } catch (error) {
    // Track failed attempt
    await trackFailedAttempt(deviceData.fingerprint, 'auth');
    throw error;
  }
}

export async function refreshAccessToken(
  refreshTokenInput: string,
  deviceFingerprint: string
): Promise<{ accessToken: string; refreshToken: string }> {
  if (!verifyFingerprintIntegrity(deviceFingerprint)) {
    throw new AppError('Invalid device fingerprint', 400);
  }

  try {
    // Verify refresh token
    const decoded = await verifyToken(refreshTokenInput);

    if (decoded.fingerprint !== deviceFingerprint) {
      throw new AppError('Device mismatch', 401);
    }

    // Validate against stored token
    const isValid = await validateRefreshToken(
      decoded.userId,
      deviceFingerprint,
      refreshTokenInput
    );

    if (!isValid) {
      throw new AppError('Invalid refresh token', 401);
    }

    // Revoke old refresh token
    await revokeRefreshToken(decoded.userId, deviceFingerprint);

    // Generate new tokens
    const payload: JwtPayload = {
      userId: decoded.userId,
      deviceId: deviceFingerprint,
      role: decoded.role,
      fingerprint: deviceFingerprint,
    };

    const accessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    // Store new refresh token
    await storeRefreshToken(decoded.userId, deviceFingerprint, newRefreshToken);

    return { accessToken, refreshToken: newRefreshToken };
  } catch (error) {
    await trackFailedAttempt(deviceFingerprint, 'refresh');
    throw error;
  }
}

export async function linkTelegramToDevice(
  deviceFingerprint: string,
  telegramId: bigint,
  username?: string,
  firstName?: string,
  lastName?: string
) {
  const prisma = getPrisma();

  // Find or create Telegram user
  let user = await prisma.user.findUnique({
    where: { telegramId },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId,
        username,
        firstName,
        lastName,
        role: 'USER',
      },
    });
  }

  // Link device to user
  await linkDeviceToUser(deviceFingerprint, user.id);

  // Revoke all existing refresh tokens for security
  await revokeAllUserTokens(user.id);

  logger.info(
    `Telegram ${telegramId} linked to device ${deviceFingerprint.substring(0, 16)}...`
  );

  return user;
}

// Re-export verifyToken for use in auth service
import { verifyToken } from '../security/jwt';
