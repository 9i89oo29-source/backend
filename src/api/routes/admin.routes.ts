import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin, requireSuperAdmin } from '../middleware/admin.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  banUserSchema,
  unbanUserSchema,
  updateUserSchema,
  broadcastSchema,
  maintenanceSchema,
} from '../validators/admin.validator';
import { providerManager } from '../../app';

const router = Router();
const adminController = new AdminController(providerManager);

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

router.get('/users', adminController.getUsers.bind(adminController));
router.get('/users/:id', adminController.getUser.bind(adminController));
router.patch('/users/:id', validate(updateUserSchema, 'body'), adminController.updateUser.bind(adminController));
router.post('/users/ban', validate(banUserSchema, 'body'), adminController.banUserHandler.bind(adminController));
router.post('/users/unban', validate(unbanUserSchema, 'body'), adminController.unbanUserHandler.bind(adminController));

router.get('/orders', adminController.getAllOrders.bind(adminController));

router.get('/providers', adminController.getProvidersStatus.bind(adminController));
router.post('/providers/:slug/sync', adminController.syncProvider.bind(adminController));

router.get('/stats', adminController.getStats.bind(adminController));

router.post('/broadcast', validate(broadcastSchema, 'body'), adminController.broadcast.bind(adminController));

router.post('/maintenance', validate(maintenanceSchema, 'body'), adminController.setMaintenance.bind(adminController));

export const adminRoutes = router;
