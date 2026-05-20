export interface TigerServiceRaw {
  service_id: number;
  name: string;
  price: number;
  quantity: number;
}

export interface TigerBuyRaw {
  status: string;
  number: string;
  id: number;
  msg?: string;
}

export interface TigerSmsRaw {
  status: string;
  sms: {
    sender: string;
    message: string;
    time: string;
  }[];
}

export interface TigerBalanceRaw {
  balance: number;
}
