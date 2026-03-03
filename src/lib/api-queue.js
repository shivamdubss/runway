/**
 * Global concurrency limiter for OpenAI image API calls.
 * Prevents rate limiting by ensuring at most MAX_CONCURRENT
 * requests are in-flight at any time.
 */

const MAX_CONCURRENT_API_CALLS = 2;

let activeCount = 0;
let maxConcurrent = MAX_CONCURRENT_API_CALLS;
const waitingQueue = []; // Array of { resolve } — callers waiting for a slot

function tryProcessNext() {
  while (activeCount < maxConcurrent && waitingQueue.length > 0) {
    const next = waitingQueue.shift();
    activeCount += 1;
    next.resolve();
  }
}

/**
 * Enqueue an async function to run within the global concurrency limit.
 * Returns a promise that resolves with fn()'s return value.
 *
 * @param {() => Promise<T>} fn - Async function to execute
 * @returns {Promise<T>}
 */
export async function enqueueApiCall(fn) {
  if (activeCount >= maxConcurrent) {
    await new Promise((resolve) => {
      waitingQueue.push({ resolve });
    });
  } else {
    activeCount += 1;
  }

  try {
    return await fn();
  } finally {
    activeCount -= 1;
    tryProcessNext();
  }
}

/**
 * Reset queue state for testing.
 */
export function __resetApiQueueForTests(overrides = {}) {
  activeCount = 0;
  waitingQueue.length = 0;
  maxConcurrent = overrides.maxConcurrent ?? MAX_CONCURRENT_API_CALLS;
}

/**
 * Get current queue stats (useful for debugging).
 */
export function getApiQueueStats() {
  return {
    activeCount,
    waitingCount: waitingQueue.length,
    maxConcurrent,
  };
}
