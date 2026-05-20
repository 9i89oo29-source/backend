import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import {
  IProvider,
  ProviderService,
  ProviderCountry,
  BuyNumberResult,
  SmsResult,
  ProviderBalance,
  ProviderHealth,
  ProviderHealthStatus,
} from './interface';
import {
  TigerServiceRaw,
  TigerBuyRaw,
  TigerSmsRaw,
  TigerBalanceRaw,
} from './dto/tiger.dto';
import { CircuitBreaker } from '../utils/circuitBreaker';

export class TigerSmsProvider implements IProvider {
  readonly name = 'TigerSMS';
  readonly slug = 'tiger-sms';

  private client!: AxiosInstance;
  private apiKey!: string;
  private breaker: CircuitBreaker;

  constructor() {
    this.breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 60000,
      name: this.slug,
    });
  }

  async initialize(apiKey: string, baseUrl: string, _secret?: string): Promise<void> {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error(`[TigerSMS] Request failed: ${error.message}`);
        return Promise.reject(error);
      }
    );

    logger.info(`[TigerSMS] Initialized with base URL ${baseUrl}`);
  }

  async destroy(): Promise<void> {
    logger.info(`[TigerSMS] Destroyed`);
  }

  async getServices(): Promise<ProviderService[]> {
    return this.breaker.execute(async () => {
      const { data } = await this.client.get<{ data: TigerServiceRaw[] }>(
        `/services?api_key=${this.apiKey}`
      );
      return (data.data || []).map((s) => ({
        id: String(s.service_id),
        name: s.name,
        price: s.price,
        available: s.quantity > 0,
      }));
    });
  }

  async getCountries(): Promise<ProviderCountry[]> {
    return this.breaker.execute(async () => {
      const { data } = await this.client.get<{ countries: any[] }>(
        `/countries?api_key=${this.apiKey}`
      );
      return (data.countries || []).map((c: any) => ({
        code: String(c.code || c.id || ''),
        name: c.name || c.country || '',
        flag: c.flag || '',
        dialCode: c.dial_code || c.phone || '',
      }));
    });
  }

  async buyNumber(serviceId: string, countryCode: string): Promise<BuyNumberResult> {
    return this.breaker.execute(async () => {
      const { data } = await this.client.post<TigerBuyRaw>(
        `/buy?api_key=${this.apiKey}&service=${serviceId}&country=${countryCode}`
      );

      if (data.status !== 'success' && data.status !== 'ok') {
        throw new Error(data.msg || 'Buy number failed');
      }

      return {
        orderId: String(data.id),
        phoneNumber: data.number,
        status: 'PENDING',
        expiresAt: undefined,
        providerRawResponse: data,
      };
    });
  }

  async getSms(orderId: string): Promise<SmsResult> {
    return this.breaker.execute(async () => {
      const { data } = await this.client.get<TigerSmsRaw>(
        `/sms?api_key=${this.apiKey}&id=${orderId}`
      );

      if (data.sms && data.sms.length > 0) {
        const lastSms = data.sms[data.sms.length - 1];
        return {
          orderId,
          status: 'RECEIVED',
          smsCode: this.extractCode(lastSms.message),
          sender: lastSms.sender,
          message: lastSms.message,
          receivedAt: lastSms.time,
        };
      }

      if (data.status === 'expired' || data.status === 'cancel') {
        return { orderId, status: 'EXPIRED' };
      }

      return { orderId, status: 'WAITING' };
    });
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await this.client.post(`/cancel?api_key=${this.apiKey}&id=${orderId}`);
      return true;
    } catch {
      return false;
    }
  }

  async getBalance(): Promise<ProviderBalance> {
    return this.breaker.execute(async () => {
      const { data } = await this.client.get<TigerBalanceRaw>(
        `/balance?api_key=${this.apiKey}`
      );
      return {
        balance: data.balance,
        currency: 'USD',
      };
    });
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      await this.client.get(`/services?api_key=${this.apiKey}`, { timeout: 5000 });
      return {
        status: ProviderHealthStatus.HEALTHY,
        lastCheck: new Date(),
        latency: Date.now() - start,
      };
    } catch (error: any) {
      return {
        status: ProviderHealthStatus.DOWN,
        lastCheck: new Date(),
        latency: Date.now() - start,
        message: error.message,
      };
    }
  }

  private extractCode(text: string): string | undefined {
    const match = text.match(/\b(\d{4,8})\b/);
    return match ? match[1] : undefined;
  }
}
