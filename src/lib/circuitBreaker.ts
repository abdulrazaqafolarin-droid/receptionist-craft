// ═══════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER PATTERN - For Resilient External Service Calls
// ═══════════════════════════════════════════════════════════════════════════

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerOptions {
  failureThreshold: number;      // Number of failures before opening
  successThreshold: number;      // Number of successes to close from half-open
  timeout: number;               // Time in ms before trying again
  monitoringPeriod: number;      // Time window to track failures
}

interface CircuitBreakerStats {
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  state: CircuitState;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,       // 30 seconds
  monitoringPeriod: 60000, // 1 minute
};

export class CircuitBreaker<T> {
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number | null = null;
  private options: CircuitBreakerOptions;

  constructor(
    private action: () => Promise<T>,
    private fallback?: () => Promise<T>,
    options: Partial<CircuitBreakerOptions> = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async execute(): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open';
      } else {
        return this.handleOpen();
      }
    }

    try {
      const result = await this.action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime >= this.options.timeout;
  }

  private onSuccess(): void {
    this.failures = 0;

    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.options.successThreshold) {
        this.state = 'closed';
        this.successes = 0;
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successes = 0;

    if (this.failures >= this.options.failureThreshold) {
      this.state = 'open';
    }
  }

  private async handleOpen(): Promise<T> {
    if (this.fallback) {
      return this.fallback();
    }
    throw new Error('Circuit breaker is open - service temporarily unavailable');
  }

  getStats(): CircuitBreakerStats {
    return {
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      state: this.state,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
  }
}

// Factory function for creating circuit breakers
export function createCircuitBreaker<T>(
  action: () => Promise<T>,
  fallback?: () => Promise<T>,
  options?: Partial<CircuitBreakerOptions>
): CircuitBreaker<T> {
  return new CircuitBreaker(action, fallback, options);
}

// Utility to wrap fetch calls with circuit breaker
export async function fetchWithCircuitBreaker<T>(
  url: string,
  options: RequestInit = {},
  fallbackValue?: T,
  breakerOptions?: Partial<CircuitBreakerOptions>
): Promise<T> {
  const breaker = createCircuitBreaker<T>(
    async () => {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    fallbackValue !== undefined
      ? async () => fallbackValue
      : undefined,
    breakerOptions
  );

  return breaker.execute();
}
