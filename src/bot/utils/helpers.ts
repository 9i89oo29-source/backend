import { Context } from 'telegraf';

export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

export function formatCurrency(amount: number): string {
  return amount.toFixed(2);
}

export function paginate<T>(items: T[], page: number, perPage: number): { items: T[]; totalPages: number } {
  const totalPages = Math.ceil(items.length / perPage);
  const start = (page - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    totalPages,
  };
}

export function getOrderStatusEmoji(status: string): string {
  switch (status) {
    case 'PENDING': return '⏳';
    case 'RECEIVED': return '✅';
    case 'CANCELLED': return '❌';
    case 'EXPIRED': return '⌛';
    default: return '❓';
  }
}
