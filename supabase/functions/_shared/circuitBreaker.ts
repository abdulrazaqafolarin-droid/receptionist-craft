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

  // Check if circuit should transition from open to half-open
  if (circuit.state === 'open') {
    const timeSinceLastFailure = circuit.lastFailureTime 
      ? Date.now() - circuit.lastFailureTime 
      : Infinity;
    
    if (timeSinceLastFailure >= opts.timeout) {
      circuit.state = 'half-open';
      circuit.successes = 0;
      console.log(`[CircuitBreaker:${serviceKey}] Transitioning to half-open`);
    } else {
      // Circuit is open, use fallback
      console.log(`[CircuitBreaker:${serviceKey}] Circuit open, using fallback`);
      if (fallback) {
        return fallback();
      }
      throw new Error(`Service ${serviceKey} is temporarily unavailable`);
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
        console.log(`[CircuitBreaker:${serviceKey}] Circuit closed`);
      }
    }
    
    return result;
  } catch (error) {
    // Failure handling
    circuit.failures++;
    circuit.lastFailureTime = Date.now();
    circuit.successes = 0;
    
    console.error(`[CircuitBreaker:${serviceKey}] Failure #${circuit.failures}:`, error);
    
    if (circuit.failures >= opts.failureThreshold) {
      circuit.state = 'open';
      console.log(`[CircuitBreaker:${serviceKey}] Circuit opened after ${circuit.failures} failures`);
    }
    
    // Try fallback if available
    if (fallback) {
      console.log(`[CircuitBreaker:${serviceKey}] Using fallback`);
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
 * Reset a circuit breaker (for testing or manual recovery)
 */
export function resetCircuit(serviceKey: string): void {
  circuitStates.delete(serviceKey);
  console.log(`[CircuitBreaker:${serviceKey}] Circuit reset`);
}

/**
 * Wrap an AI API call with circuit breaker
 */
export async function callAIWithCircuitBreaker<T>(
  provider: string,
  apiCall: () => Promise<T>,
  fallbackResponse?: T
): Promise<T> {
  return withCircuitBreaker(
    `ai:${provider}`,
    apiCall,
    fallbackResponse !== undefined 
      ? async () => fallbackResponse 
      : undefined,
    {
      failureThreshold: 3,
      timeout: 60000, // 1 minute for AI services
    }
  );
}
