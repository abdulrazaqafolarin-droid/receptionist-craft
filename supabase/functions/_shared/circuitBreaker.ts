// ═══════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER PATTERN - For Resilient External Service Calls (Deno/Edge)
// ═══════════════════════════════════════════════════════════════════════════

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerOptions {
  failureThreshold: number;      // Number of failures before opening
  successThreshold: number;      // Number of successes to close from half-open
  timeout: number;               // Time in ms before trying again
}

interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastError: string | null;
  totalRequests: number;
  totalFailures: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,       // 30 seconds
};

// Global circuit breaker state (persists across requests in same instance)
const circuitStates = new Map<string, CircuitStats>();

/**
 * Get or initialize circuit state for a service
 */
function getCircuitState(serviceKey: string): CircuitStats {
  let state = circuitStates.get(serviceKey);
  if (!state) {
    state = {
      state: 'closed',
      failures: 0,
      successes: 0,
      lastFailureTime: null,
      lastError: null,
      totalRequests: 0,
      totalFailures: 0,
    };
    circuitStates.set(serviceKey, state);
  }
  return state;
}

/**
 * Execute a function with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
  serviceKey: string,
  action: () => Promise<T>,
  fallback?: () => Promise<T>,
  options: Partial<CircuitBreakerOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const circuit = getCircuitState(serviceKey);
  circuit.totalRequests++;

  // Check if circuit should transition from open to half-open
  if (circuit.state === 'open') {
    const timeSinceLastFailure = circuit.lastFailureTime 
      ? Date.now() - circuit.lastFailureTime 
      : Infinity;
    
    if (timeSinceLastFailure >= opts.timeout) {
      circuit.state = 'half-open';
      circuit.successes = 0;
      console.log(`[CircuitBreaker:${serviceKey}] Transitioning to half-open after ${Math.round(timeSinceLastFailure / 1000)}s`);
    } else {
      // Circuit is open, use fallback
      console.warn(`[CircuitBreaker:${serviceKey}] Circuit OPEN (${circuit.failures} failures, last: ${circuit.lastError}). Using fallback.`);
      if (fallback) {
        return fallback();
      }
      throw new Error(`Service ${serviceKey} is temporarily unavailable (circuit open). Last error: ${circuit.lastError}`);
    }
  }

  try {
    const result = await action();
    
    // Success handling
    circuit.failures = 0;
    if (circuit.state === 'half-open') {
      circuit.successes++;
      if (circuit.successes >= opts.successThreshold) {
        circuit.state = 'closed';
        circuit.lastError = null;
        console.log(`[CircuitBreaker:${serviceKey}] Circuit CLOSED after ${circuit.successes} consecutive successes`);
      }
    }
    
    return result;
  } catch (error) {
    // Failure handling
    circuit.failures++;
    circuit.totalFailures++;
    circuit.lastFailureTime = Date.now();
    circuit.lastError = error instanceof Error ? error.message : String(error);
    circuit.successes = 0;
    
    console.error(`[CircuitBreaker:${serviceKey}] Failure #${circuit.failures}/${opts.failureThreshold}: ${circuit.lastError}`);
    
    if (circuit.failures >= opts.failureThreshold) {
      circuit.state = 'open';
      console.warn(`[CircuitBreaker:${serviceKey}] Circuit OPENED after ${circuit.failures} failures. Will retry in ${opts.timeout / 1000}s`);
    }
    
    // Try fallback if available
    if (fallback) {
      console.log(`[CircuitBreaker:${serviceKey}] Using fallback response`);
      return fallback();
    }
    
    throw error;
  }
}

/**
 * Get circuit breaker statistics for monitoring
 */
export function getCircuitStats(serviceKey: string): CircuitStats | null {
  return circuitStates.get(serviceKey) || null;
}

/**
 * Get all circuit stats for dashboard monitoring
 */
export function getAllCircuitStats(): Record<string, CircuitStats> {
  const result: Record<string, CircuitStats> = {};
  for (const [key, stats] of circuitStates.entries()) {
    result[key] = { ...stats };
  }
  return result;
}

/**
 * Reset a circuit breaker (for testing or manual recovery)
 */
export function resetCircuit(serviceKey: string): void {
  circuitStates.delete(serviceKey);
  console.log(`[CircuitBreaker:${serviceKey}] Circuit reset`);
}

/**
 * Wrap an AI API call with circuit breaker + timeout
 */
export async function callAIWithCircuitBreaker<T>(
  provider: string,
  apiCall: () => Promise<T>,
  fallbackResponse?: T,
  timeoutMs: number = 30000
): Promise<T> {
  return withCircuitBreaker(
    `ai:${provider}`,
    async () => {
      // Add timeout to AI calls
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const result = await Promise.race([
          apiCall(),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error(`AI call to ${provider} timed out after ${timeoutMs}ms`));
            });
          }),
        ]);
        return result;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    fallbackResponse !== undefined 
      ? async () => fallbackResponse 
      : undefined,
    {
      failureThreshold: 3,
      timeout: 60000, // 1 minute for AI services
    }
  );
}

/**
 * Wrap a database call with circuit breaker
 */
export async function callDBWithCircuitBreaker<T>(
  operation: string,
  dbCall: () => Promise<T>,
  fallback?: () => Promise<T>
): Promise<T> {
  return withCircuitBreaker(
    `db:${operation}`,
    dbCall,
    fallback,
    {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 15000, // 15 seconds for DB
    }
  );
}
