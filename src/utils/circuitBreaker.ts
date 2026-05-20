import { logger } from './logger';

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number; // milliseconds
  name?: string;
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = {
      failureThreshold: options.failureThreshold,
      resetTimeout: options.resetTimeout,
      name: options.name || 'unnamed',
    };
  }

  async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
        this.state = CircuitState.HALF_OPEN;
        logger.info(`[CB:${this.options.name}] Half-open – testing`);
      } else {
        throw new Error(`Circuit breaker is OPEN for ${this.options.name}`);
      }
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      logger.error(
        `[CB:${this.options.name}] Opened after ${this.failureCount} failures`
      );
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}
