import { Request, Response, NextFunction } from 'express';
import { ProviderService } from '../../services/provider.service';
import { logger } from '../../utils/logger';

export class ServicesController {
  constructor(private providerService: ProviderService) {}

  /**
   * GET /api/v1/services?provider=hero-sms (optional)
   */
  async getServices(req: Request, res: Response, next: NextFunction) {
    try {
      const providerSlug = req.query.provider as string | undefined;
      const services = await this.providerService.getAvailableServices(providerSlug);

      res.status(200).json({
        status: 'success',
        results: services.length,
        data: services,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/countries
   */
  async getCountries(req: Request, res: Response, next: NextFunction) {
    try {
      const countries = await this.providerService.getAvailableCountries();

      res.status(200).json({
        status: 'success',
        results: countries.length,
        data: countries,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/providers
   */
  async getProviders(req: Request, res: Response, next: NextFunction) {
    try {
      const providers = await this.providerService.getProviders();

      res.status(200).json({
        status: 'success',
        data: providers,
      });
    } catch (error) {
      next(error);
    }
  }
}
