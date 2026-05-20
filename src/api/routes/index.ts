import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { servicesRoutes } from './services.routes';
import { ordersRoutes } from './orders.routes';
import { balanceRoutes } from './balance.routes';
import { healthRoutes } from './health.routes';
import { adminRoutes } from './admin.routes';

const router = Router();

const API_PREFIX = '/api/v1';

// Health without prefix for load balancers
router.use('/health', healthRoutes);

// Versioned API
router.use(`${API_PREFIX}/auth`, authRoutes);
router.use(`${API_PREFIX}/services`, servicesRoutes);
router.use(`${API_PREFIX}/countries`, servicesRoutes); // reuse same controller for countries
router.use(`${API_PREFIX}/providers`, servicesRoutes); // reuse for providers
router.use(`${API_PREFIX}/orders`, ordersRoutes);
router.use(`${API_PREFIX}/balance`, balanceRoutes);
router.use(`${API_PREFIX}/admin`, adminRoutes);

export const apiRouter = router;
