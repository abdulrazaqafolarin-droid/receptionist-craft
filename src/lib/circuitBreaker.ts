// ═══════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER PATTERN - For Resilient Frontend Service Calls
// ═══════════════════════════════════════════════════════════════════════════

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  onStateChange?: (from: CircuitState, to: CircuitState, serviceName: string) => void;
}

interface CircuitBreakerStats {
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastError: string | null;
  state: CircuitState;
  totalRequests: number;
  totalFailures: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
};

export class CircuitBreaker<T> {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private lastError: string | null = null;
  private totalRequests = 0;
  private totalFailures = 0;
  private options: CircuitBreakerOptions;

  constructor(
    private name: string,
    private action: () => Promise<T>,
    private fallback?: () => Promise<T>,
    options: Partial<CircuitBreakerOptions> = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async execute(): Promise<T> {
    this.totalRequests++;

    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.transition('half-open');
      } else {
        return this.handleOpen();
      }
    }

    try {
      const result = await this.action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime >= this.options.timeout;
  }

  private transition(to: CircuitState): void {
    const from = this.state;
    this.state = to;
    this.options.onStateChange?.(from, to, this.name);
    
    if (to === 'half-open') this.successes = 0;
    if (to === 'closed') {
      this.lastError = null;
      console.log(`[CircuitBreaker:${this.name}] Recovered after ${this.totalFailures} total failures`);
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.options.successThreshold) {
        this.transition('closed');
      }
    }
  }

  private onFailure(error: unknown): void {
    this.failures++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.lastError = error instanceof Error ? error.message : String(error);
    this.successes = 0;

    if (this.failures >= this.options.failureThreshold) {
      this.transition('open');
    }
  }

  private async handleOpen(): Promise<T> {
    if (this.fallback) {
      return this.fallback();
    }
    throw new Error(`[${this.name}] Service temporarily unavailable. Last error: ${this.lastError}`);
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    return {
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastError: this.lastError,
      state: this.state,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    };
  }

  reset(): void {
    this.transition('closed');
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.lastError = null;
  }
}

// Factory for creating named circuit breakers
export function createCircuitBreaker<T>(
  name: string,
  action: () => Promise<T>,
  fallback?: () => Promise<T>,
  options?: Partial<CircuitBreakerOptions>
): CircuitBreaker<T> {
  return new CircuitBreaker(name, action, fallback, options);
}

// Utility to wrap fetch calls with circuit breaker
export async function fetchWithCircuitBreaker<T>(
  url: string,
  options: RequestInit = {},
  fallbackValue?: T,
  breakerOptions?: Partial<CircuitBreakerOptions>
): Promise<T> {
  const breaker = createCircuitBreaker<T>(
    new URL(url).pathname,
    async () => {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    fallbackValue !== undefined ? async () => fallbackValue : undefined,
    breakerOptions
  );

  return breaker.execute();
}
