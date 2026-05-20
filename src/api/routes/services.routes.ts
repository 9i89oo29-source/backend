import { Router } from 'express';
import { ServicesController } from '../controllers/services.controller';
import { authenticate } from '../middleware/auth.middleware';
import { ProviderService } from '../../services/provider.service';
import { providerManager } from '../../app'; // We'll export providerManager from app.ts

const router = Router();
const servicesController = new ServicesController(new ProviderService(providerManager));

// All routes require authentication
router.use(authenticate);

router.get('/services', servicesController.getServices.bind(servicesController));
router.get('/countries', servicesController.getCountries.bind(servicesController));
router.get('/providers', servicesController.getProviders.bind(servicesController));

export const servicesRoutes = router;
