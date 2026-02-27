import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('searchCities', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array for empty query', async () => {
    const { searchCities } = await import('../src/lib/weather.js');
    expect(await searchCities('')).toEqual([]);
    expect(await searchCities(null)).toEqual([]);
    expect(await searchCities(undefined)).toEqual([]);
  });

  it('returns empty array for single character query', async () => {
    const { searchCities } = await import('../src/lib/weather.js');
    expect(await searchCities('a')).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns empty array for whitespace-only query', async () => {
    const { searchCities } = await import('../src/lib/weather.js');
    expect(await searchCities('  ')).toEqual([]);
    expect(await searchCities(' a ')).toEqual([]);
  });

  it('returns formatted results on successful API response', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        results: [
          { name: 'Toronto', admin1: 'Ontario', country: 'Canada', latitude: 43.7, longitude: -79.42 },
          { name: 'Torino', admin1: 'Piedmont', country: 'Italy', latitude: 45.07, longitude: 7.69 },
        ],
      }),
    }));

    const { searchCities } = await import('../src/lib/weather.js');
    const results = await searchCities('Tor');

    expect(results).toEqual([
      { name: 'Toronto', admin1: 'Ontario', country: 'Canada' },
      { name: 'Torino', admin1: 'Piedmont', country: 'Italy' },
    ]);
  });

  it('calls Open-Meteo with correct URL parameters', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    }));

    const { searchCities } = await import('../src/lib/weather.js');
    await searchCities('New York');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('geocoding-api.open-meteo.com');
    expect(url).toContain('name=New%20York');
    expect(url).toContain('count=5');
    expect(url).toContain('language=en');
  });

  it('returns empty array when API returns no results key', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    }));

    const { searchCities } = await import('../src/lib/weather.js');
    expect(await searchCities('xyzabc')).toEqual([]);
  });

  it('returns empty array on non-ok response', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 }));

    const { searchCities } = await import('../src/lib/weather.js');
    expect(await searchCities('Toronto')).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

    const { searchCities } = await import('../src/lib/weather.js');
    expect(await searchCities('Toronto')).toEqual([]);
  });

  it('handles missing admin1 and country gracefully', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        results: [
          { name: 'SomePlace', latitude: 0, longitude: 0 },
        ],
      }),
    }));

    const { searchCities } = await import('../src/lib/weather.js');
    const results = await searchCities('SomePlace');

    expect(results).toEqual([
      { name: 'SomePlace', admin1: '', country: '' },
    ]);
  });
});
