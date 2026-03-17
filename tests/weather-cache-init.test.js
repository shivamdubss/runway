import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const CACHE_KEY = 'runway_weather_cache_metric';

function createLocalStorageMock() {
  const store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    _store: store,
  };
}

let localStorageMock;

beforeEach(() => {
  vi.resetModules();
  localStorageMock = createLocalStorageMock();
  vi.stubGlobal('localStorage', localStorageMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('getWeatherFromCache', () => {
  it('returns null for falsy city', async () => {
    const { getWeatherFromCache } = await import('../src/lib/weather.js');
    expect(getWeatherFromCache(null)).toBeNull();
    expect(getWeatherFromCache(undefined)).toBeNull();
    expect(getWeatherFromCache('')).toBeNull();
  });

  it('returns null when localStorage is empty', async () => {
    const { getWeatherFromCache } = await import('../src/lib/weather.js');
    expect(getWeatherFromCache('New York')).toBeNull();
  });

  it('returns null when cached data is for a different city', async () => {
    localStorageMock.setItem(CACHE_KEY, JSON.stringify({
      city: 'Chicago',
      data: { temp: 20, condition: 'Clear', icon: '01d', city: 'Chicago' },
      fetchedAt: Date.now(),
    }));
    const { getWeatherFromCache } = await import('../src/lib/weather.js');
    expect(getWeatherFromCache('New York')).toBeNull();
  });

  it('returns null when cache has expired', async () => {
    const thirtyOneMinutesAgo = Date.now() - 31 * 60 * 1000;
    localStorageMock.setItem(CACHE_KEY, JSON.stringify({
      city: 'New York',
      data: { temp: 22, condition: 'Clouds', icon: '03d', city: 'New York' },
      fetchedAt: thirtyOneMinutesAgo,
    }));
    const { getWeatherFromCache } = await import('../src/lib/weather.js');
    expect(getWeatherFromCache('New York')).toBeNull();
  });

  it('returns cached data when city matches and TTL is valid', async () => {
    const weatherData = { temp: 22, condition: 'Clouds', icon: '03d', city: 'New York' };
    localStorageMock.setItem(CACHE_KEY, JSON.stringify({
      city: 'New York',
      data: weatherData,
      fetchedAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago
    }));
    const { getWeatherFromCache } = await import('../src/lib/weather.js');
    expect(getWeatherFromCache('New York')).toEqual(weatherData);
  });

  it('returns null when cache JSON is corrupt', async () => {
    localStorageMock.setItem(CACHE_KEY, '{not valid json!!!');
    const { getWeatherFromCache } = await import('../src/lib/weather.js');
    expect(getWeatherFromCache('New York')).toBeNull();
  });

  it('returns data at exactly the TTL boundary (29 min 59 sec)', async () => {
    const weatherData = { temp: 15, condition: 'Rain', icon: '10d', city: 'London' };
    localStorageMock.setItem(CACHE_KEY, JSON.stringify({
      city: 'London',
      data: weatherData,
      fetchedAt: Date.now() - (30 * 60 * 1000 - 1000), // 1 second before expiry
    }));
    const { getWeatherFromCache } = await import('../src/lib/weather.js');
    expect(getWeatherFromCache('London')).toEqual(weatherData);
  });
});
