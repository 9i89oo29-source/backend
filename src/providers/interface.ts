export interface ProviderService {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

export interface ProviderCountry {
  code: string;
  name: string;
  flag?: string;
  dialCode: string;
}

export interface BuyNumberResult {
  orderId: string;
  phoneNumber: string;
  status: string;
  expiresAt?: string;
  providerRawResponse?: Record<string, any>;
}

export interface SmsResult {
  orderId: string;
  status: 'WAITING' | 'RECEIVED' | 'EXPIRED';
  smsCode?: string;
  sender?: string;
  message?: string;
  receivedAt?: string;
}

export interface ProviderBalance {
  balance: number;
  currency: string;
}

export enum ProviderHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  DOWN = 'down',
}

export interface ProviderHealth {
  status: ProviderHealthStatus;
  lastCheck: Date;
  latency: number;
  message?: string;
}

export interface IProvider {
  readonly name: string;
  readonly slug: string;

  getServices(): Promise<ProviderService[]>;
  getCountries(): Promise<ProviderCountry[]>;
  buyNumber(serviceId: string, countryCode: string): Promise<BuyNumberResult>;
  getSms(orderId: string): Promise<SmsResult>;
  cancelOrder(orderId: string): Promise<boolean>;
  getBalance(): Promise<ProviderBalance>;
  healthCheck(): Promise<ProviderHealth>;

  // Lifecycle
  initialize(apiKey: string, baseUrl: string, secret?: string): Promise<void>;
  destroy(): Promise<void>;
}
