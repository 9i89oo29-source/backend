import { z } from 'zod';

export const deviceAuthSchema = z.object({
  fingerprint: z.string().min(64).max(64).regex(/^[a-f0-9]+$/),
  deviceId: z.string().optional(),
  appSignature: z.string().optional(),
  installTimestamp: z.string().optional(),
  platform: z.string().optional(),
  model: z.string().optional(),
});

export const linkDeviceSchema = z.object({
  telegramId: z.number().int().positive().optional(),
  userId: z.string().uuid().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type DeviceAuthInput = z.infer<typeof deviceAuthSchema>;
export type LinkDeviceInput = z.infer<typeof linkDeviceSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
