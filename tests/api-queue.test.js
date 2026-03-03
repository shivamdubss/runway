import { describe, it, expect, beforeEach } from 'vitest';

const {
  enqueueApiCall,
  __resetApiQueueForTests,
  getApiQueueStats,
} = await import('../src/lib/api-queue.js');

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  __resetApiQueueForTests();
});

describe('api-queue concurrency limiter', () => {
  it('allows up to maxConcurrent calls simultaneously', async () => {
    __resetApiQueueForTests({ maxConcurrent: 2 });
    let active = 0;
    let maxActive = 0;
    const resolvers = [];

    const makeTask = () =>
      enqueueApiCall(() => new Promise((resolve) => {
        active++;
        maxActive = Math.max(maxActive, active);
        resolvers.push(() => {
          active--;
          resolve('done');
        });
      }));

    const p1 = makeTask();
    const p2 = makeTask();
    const p3 = makeTask();

    await flushAsyncWork();
    expect(maxActive).toBe(2);
    expect(getApiQueueStats().waitingCount).toBe(1);

    // Resolve first — third should start
    resolvers.shift()();
    await flushAsyncWork();
    expect(active).toBe(2); // second + third

    resolvers.shift()();
    resolvers.shift()();
    await Promise.all([p1, p2, p3]);
  });

  it('returns the resolved value from fn()', async () => {
    const result = await enqueueApiCall(async () => 42);
    expect(result).toBe(42);
  });

  it('propagates errors from fn() and releases the slot', async () => {
    __resetApiQueueForTests({ maxConcurrent: 1 });

    const p1 = enqueueApiCall(async () => { throw new Error('fail'); });
    await expect(p1).rejects.toThrow('fail');

    // Slot should be released — next call proceeds immediately
    const result = await enqueueApiCall(async () => 'recovered');
    expect(result).toBe('recovered');
  });

  it('processes in FIFO order', async () => {
    __resetApiQueueForTests({ maxConcurrent: 1 });
    const order = [];
    const resolvers = [];

    const makeTask = (id) =>
      enqueueApiCall(() => new Promise((resolve) => {
        order.push(id);
        resolvers.push(() => resolve());
      }));

    const p1 = makeTask('a');
    const p2 = makeTask('b');
    const p3 = makeTask('c');

    await flushAsyncWork();
    expect(order).toEqual(['a']);

    resolvers.shift()();
    await flushAsyncWork();
    expect(order).toEqual(['a', 'b']);

    resolvers.shift()();
    await flushAsyncWork();
    expect(order).toEqual(['a', 'b', 'c']);

    resolvers.shift()();
    await Promise.all([p1, p2, p3]);
  });

  it('with maxConcurrent=1, serializes all calls', async () => {
    __resetApiQueueForTests({ maxConcurrent: 1 });
    let active = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 5 }, (_, i) =>
      enqueueApiCall(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active--;
        return i;
      })
    );

    const results = await Promise.all(tasks);
    expect(maxActive).toBe(1);
    expect(results).toEqual([0, 1, 2, 3, 4]);
  });

  it('reset clears waiting queue and resets active count', () => {
    __resetApiQueueForTests({ maxConcurrent: 3 });
    expect(getApiQueueStats().maxConcurrent).toBe(3);

    __resetApiQueueForTests();
    expect(getApiQueueStats().activeCount).toBe(0);
    expect(getApiQueueStats().waitingCount).toBe(0);
    expect(getApiQueueStats().maxConcurrent).toBe(2);
  });

  it('limits total concurrent calls when visualization and item-image overlap', async () => {
    __resetApiQueueForTests({ maxConcurrent: 2 });
    let active = 0;
    let maxActive = 0;
    const resolvers = [];

    const makeTask = () =>
      enqueueApiCall(() => new Promise((resolve) => {
        active++;
        maxActive = Math.max(maxActive, active);
        resolvers.push(() => { active--; resolve('done'); });
      }));

    // Simulate: 3 viz poses + 2 item images all enqueued
    const tasks = Array.from({ length: 5 }, () => makeTask());

    await flushAsyncWork();
    expect(maxActive).toBe(2);

    // Drain all — each resolve frees a slot which starts the next queued task,
    // so we need to flush between rounds to let new tasks begin
    for (let i = 0; i < 10; i++) {
      if (resolvers.length === 0) await flushAsyncWork();
      if (resolvers.length === 0) break;
      while (resolvers.length) resolvers.shift()();
      await flushAsyncWork();
    }

    await Promise.all(tasks);
    expect(maxActive).toBe(2);
  });
});
