import { z } from 'zod';

export const banUserSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().min(3).max(500),
  durationHours: z.number().int().positive().optional(),
});

export const unbanUserSchema = z.object({
  userId: z.string().uuid(),
});

export const updateUserSchema = z.object({
  balance: z.number().min(0).optional(),
  subscription: z.enum(['FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE']).optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

export const broadcastSchema = z.object({
  message: z.string().min(1).max(4000),
  targetRole: z.enum(['USER', 'ADMIN', 'ALL']).optional(),
});

export const maintenanceSchema = z.object({
  enabled: z.boolean(),
  message: z.string().max(500).optional(),
});

export type BanUserInput = z.infer<typeof banUserSchema>;
export type UnbanUserInput = z.infer<typeof unbanUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type BroadcastInput = z.infer<typeof broadcastSchema>;
export type MaintenanceInput = z.infer<typeof maintenanceSchema>;
