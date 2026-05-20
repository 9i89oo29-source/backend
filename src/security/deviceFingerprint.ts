import crypto from 'crypto';
import { env } from '../config/env';
import { getPrisma } from '../database/prisma';
import { logger } from '../utils/logger';

export interface DeviceFingerprintInput {
  fingerprint: string;
  deviceId?: string;
  appSignature?: string;
  installTimestamp?: string;
}

export function normalizeFingerprint(input: DeviceFingerprintInput): string {
  const raw = [
    input.deviceId || 'unknown',
    input.appSignature || 'unknown',
    input.installTimestamp || '0',
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function findOrCreateDevice(fingerprint: string, deviceData: DeviceFingerprintInput) {
  const prisma = getPrisma();

  let device = await prisma.device.findUnique({
    where: { fingerprint },
    include: { user: true },
  });

  if (!device) {
    device = await prisma.device.create({
      data: {
        fingerprint,
        deviceId: deviceData.deviceId || 'unknown',
        appSignature: deviceData.appSignature || null,
        installDate: deviceData.installTimestamp 
          ? new Date(Number(deviceData.installTimestamp)) 
          : new Date(),
        lastSeen: new Date(),
        isVerified: true,
      },
      include: { user: true },
    });
    logger.info(`New device registered: ${fingerprint.substring(0, 16)}...`);
  } else {
    await prisma.device.update({
      where: { id: device.id },
      data: { lastSeen: new Date() },
    });
  }

  return device;
}

export async function linkDeviceToUser(deviceFingerprint: string, userId: string) {
  const prisma = getPrisma();
  await prisma.device.update({
    where: { fingerprint: deviceFingerprint },
    data: { userId },
  });
  logger.info(`Device ${deviceFingerprint.substring(0, 16)}... linked to user ${userId}`);
}

export function verifyFingerprintIntegrity(fingerprint: string): boolean {
  // Fingerprint must be a 64-character hex string (SHA-256)
  return /^[a-f0-9]{64}$/.test(fingerprint);
}
