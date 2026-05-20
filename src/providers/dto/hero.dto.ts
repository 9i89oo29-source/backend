export interface HeroServiceRaw {
  id: string;
  name: string;
  price: string;
  available: boolean;
}

export interface HeroBuyRaw {
  status: string;
  number: string;
  activation_id: string;
  message?: string;
}

export interface HeroSmsRaw {
  status: string;
  sms: {
    from: string;
    text: string;
    received_at: string;
  }[];
}

export interface HeroBalanceRaw {
  balance: string;
  currency: string;
}
