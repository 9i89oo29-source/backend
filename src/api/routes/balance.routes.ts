import { Router } from 'express';
import { BalanceController } from '../controllers/balance.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const balanceController = new BalanceController();

router.get('/', authenticate, balanceController.getBalance.bind(balanceController));

export const balanceRoutes = router;
