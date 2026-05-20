import { Router } from 'express';
import { OrdersController } from '../controllers/orders.controller';
import { authenticate } from '../middleware/auth.middleware';
import { OrderService } from '../../services/order.service';
import { providerManager } from '../../app';

const router = Router();
const ordersController = new OrdersController(new OrderService(providerManager));

router.use(authenticate);

router.post('/', ordersController.createOrder.bind(ordersController));
router.get('/', ordersController.getUserOrders.bind(ordersController));
router.get('/:id', ordersController.getOrder.bind(ordersController));
router.get('/:id/poll', ordersController.pollOrder.bind(ordersController));
router.post('/:id/cancel', ordersController.cancelOrder.bind(ordersController));

export const ordersRoutes = router;
