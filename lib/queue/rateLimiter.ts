export interface LimiterOptions {
  maxConcurrent: number;
  minIntervalMs: number;
}

export interface Limiter {
  schedule<T>(fn: () => Promise<T>): Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Enforces both a concurrency cap and a minimum gap between request *starts*.
 * The free Gemini tier fails on requests-per-minute long before it fails on
 * anything else, and the daily ceiling never recovers inside a build window —
 * so pacing is cheaper than retrying.
 */
export function createLimiter({
  maxConcurrent,
  minIntervalMs,
}: LimiterOptions): Limiter {
  let active = 0;
  let lastStart = 0;
  const waiting: Array<() => void> = [];

  const release = () => {
    active--;
    waiting.shift()?.();
  };

  async function schedule<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active++;

    const gap = lastStart + minIntervalMs - Date.now();
    if (gap > 0) await sleep(gap);
    lastStart = Date.now();

    try {
      return await fn();
    } finally {
      release();
    }
  }

  return { schedule };
}
