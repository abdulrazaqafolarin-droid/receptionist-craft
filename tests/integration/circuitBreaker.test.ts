import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { CircuitBreaker } from '@/lib/circuitBreaker';

describe('Circuit Breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in closed state', () => {
    const cb = new CircuitBreaker('test', () => Promise.resolve('ok'), undefined, { failureThreshold: 3, timeout: 1000 });
    expect(cb.getState()).toBe('closed');
  });

  it('opens after threshold failures', async () => {
    let failCount = 0;
    const cb = new CircuitBreaker('test', () => { failCount++; return Promise.reject(new Error('fail')); }, undefined, { failureThreshold: 3, timeout: 1000 });
    
    // Fail 3 times
    await expect(cb.execute()).rejects.toThrow();
    await expect(cb.execute()).rejects.toThrow();
    await expect(cb.execute()).rejects.toThrow();
    
    expect(cb.getState()).toBe('open');
  });

  it('rejects immediately when open', async () => {
    const cb = new CircuitBreaker('test', () => Promise.reject(new Error('fail')), undefined, { failureThreshold: 1, timeout: 1000 });
    
    await expect(cb.execute()).rejects.toThrow();
    expect(cb.getState()).toBe('open');
    
    await expect(cb.execute()).rejects.toThrow('Service temporarily unavailable');
  });

  it('transitions to half-open after timeout', async () => {
    vi.useFakeTimers();
    let failCount = 0;
    const cb = new CircuitBreaker('test', () => { failCount++; return Promise.reject(new Error('fail')); }, undefined, { failureThreshold: 1, timeout: 100 });
    
    await expect(cb.execute()).rejects.toThrow();
    expect(cb.getState()).toBe('open');
    
    // Advance time past reset timeout
    vi.advanceTimersByTime(150);
    
    // Should allow one request through (half-open)
    let successCount = 0;
    const cb2 = new CircuitBreaker('test', () => { successCount++; return Promise.resolve('success'); }, undefined, { failureThreshold: 1, timeout: 100 });
    await cb2.execute();
    expect(cb2.getState()).toBe('closed');
  });

  it('resets on success in half-open state', async () => {
    vi.useFakeTimers();
    let failCount = 0;
    const cb = new CircuitBreaker('test', () => { failCount++; return Promise.reject(new Error('fail')); }, undefined, { failureThreshold: 2, timeout: 100 });
    
    await expect(cb.execute()).rejects.toThrow();
    await expect(cb.execute()).rejects.toThrow();
    expect(cb.getState()).toBe('open');
    
    // Advance to half-open
    vi.advanceTimersByTime(150);
    
    // Success in half-open should close circuit
    let successCount = 0;
    const cb2 = new CircuitBreaker('test', () => { successCount++; return Promise.resolve('success'); }, undefined, { failureThreshold: 2, timeout: 100 });
    await cb2.execute();
    expect(cb2.getState()).toBe('closed');
  });

  it('tracks failure counts correctly', async () => {
    let failCount = 0;
    const cb = new CircuitBreaker('test', () => { failCount++; return Promise.reject(new Error('fail')); }, undefined, { failureThreshold: 3, timeout: 1000 });
    
    expect(cb.getStats()).toEqual({ failures: 0, successes: 0, lastFailureTime: null, lastError: null, state: 'closed', totalRequests: 0, totalFailures: 0 });
    
    await cb.execute().catch(() => {});
    expect(cb.getStats().failures).toBe(1);
    
    await cb.execute().catch(() => {});
    expect(cb.getStats().failures).toBe(2);
  });

  it('handles concurrent requests correctly', async () => {
    let failCount = 0;
    const cb = new CircuitBreaker('test', () => { failCount++; return Promise.reject(new Error('fail')); }, undefined, { failureThreshold: 2, timeout: 1000 });
    
    const promise1 = cb.execute();
    const promise2 = cb.execute();
    
    await Promise.all([promise1.catch(e => e), promise2.catch(e => e)]);
    expect(cb.getState()).toBe('open');
  });
});
