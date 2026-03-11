import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Tests for wmoCodeToEmoji (pure function) ---

import { wmoCodeToEmoji } from '../src/lib/weather.js';

describe('wmoCodeToEmoji', () => {
  it('returns sun for clear sky (code 0)', () => {
    expect(wmoCodeToEmoji(0)).toBe('☀️');
  });

  it('returns partly cloudy for codes 1-3', () => {
    expect(wmoCodeToEmoji(1)).toBe('⛅');
    expect(wmoCodeToEmoji(2)).toBe('⛅');
    expect(wmoCodeToEmoji(3)).toBe('⛅');
  });

  it('returns fog for codes 45-48', () => {
    expect(wmoCodeToEmoji(45)).toBe('🌫️');
    expect(wmoCodeToEmoji(48)).toBe('🌫️');
  });

  it('returns rain for drizzle/rain codes', () => {
    expect(wmoCodeToEmoji(51)).toBe('🌧️');
    expect(wmoCodeToEmoji(61)).toBe('🌧️');
    expect(wmoCodeToEmoji(80)).toBe('🌧️');
  });

  it('returns snow for snow codes', () => {
    expect(wmoCodeToEmoji(71)).toBe('🌨️');
    expect(wmoCodeToEmoji(85)).toBe('🌨️');
  });

  it('returns thunderstorm for codes 95+', () => {
    expect(wmoCodeToEmoji(95)).toBe('⛈️');
    expect(wmoCodeToEmoji(99)).toBe('⛈️');
  });

  it('returns empty string for null/undefined', () => {
    expect(wmoCodeToEmoji(null)).toBe('');
    expect(wmoCodeToEmoji(undefined)).toBe('');
  });
});

// --- Tests for fetchForecastForTrip (requires mocking) ---

describe('fetchForecastForTrip', () => {
  let fetchForecastForTrip;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('localStorage', {
      store: {},
      getItem(key) { return this.store[key] || null; },
      setItem(key, val) { this.store[key] = val; },
      removeItem(key) { delete this.store[key]; },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function loadModule() {
    const mod = await import('../src/lib/weather.js');
    return mod.fetchForecastForTrip;
  }

  it('returns null for missing city', async () => {
    fetchForecastForTrip = await loadModule();
    expect(await fetchForecastForTrip('', '2026-03-11', '2026-03-13')).toBeNull();
    expect(await fetchForecastForTrip(null, '2026-03-11', '2026-03-13')).toBeNull();
  });

  it('returns null for missing dates', async () => {
    fetchForecastForTrip = await loadModule();
    expect(await fetchForecastForTrip('Paris', '', '2026-03-13')).toBeNull();
    expect(await fetchForecastForTrip('Paris', '2026-03-11', '')).toBeNull();
  });

  it('returns forecast data on success', async () => {
    const geoResponse = {
      ok: true,
      json: async () => ({
        results: [{ name: 'Paris', latitude: 48.85, longitude: 2.35 }],
      }),
    };
    const forecastResponse = {
      ok: true,
      json: async () => ({
        daily: {
          time: ['2026-03-11', '2026-03-12', '2026-03-13'],
          weathercode: [0, 3, 61],
          temperature_2m_max: [15.2, 12.8, 10.1],
          temperature_2m_min: [8.3, 6.1, 4.9],
        },
      }),
    };

    fetch.mockResolvedValueOnce(geoResponse).mockResolvedValueOnce(forecastResponse);
    fetchForecastForTrip = await loadModule();

    const result = await fetchForecastForTrip('Paris', '2026-03-11', '2026-03-13');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ date: '2026-03-11', weatherCode: 0, tempMax: 15, tempMin: 8 });
    expect(result[1]).toEqual({ date: '2026-03-12', weatherCode: 3, tempMax: 13, tempMin: 6 });
    expect(result[2]).toEqual({ date: '2026-03-13', weatherCode: 61, tempMax: 10, tempMin: 5 });
  });

  it('returns null when geocoding fails', async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    fetchForecastForTrip = await loadModule();

    const result = await fetchForecastForTrip('Nonexistent', '2026-03-11', '2026-03-13');
    expect(result).toBeNull();
  });

  it('returns null when geocoding returns no results', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });
    fetchForecastForTrip = await loadModule();

    const result = await fetchForecastForTrip('???', '2026-03-11', '2026-03-13');
    expect(result).toBeNull();
  });

  it('returns null when forecast API fails', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ name: 'Paris', latitude: 48.85, longitude: 2.35 }] }),
    }).mockResolvedValueOnce({ ok: false });
    fetchForecastForTrip = await loadModule();

    const result = await fetchForecastForTrip('Paris', '2026-03-11', '2026-03-13');
    expect(result).toBeNull();
  });

  it('returns cached data when available', async () => {
    const cachedData = [
      { date: '2026-03-11', weatherCode: 0, tempMax: 15, tempMin: 8 },
    ];
    localStorage.store.runway_forecast_cache = JSON.stringify({
      key: 'Paris|2026-03-11|2026-03-11',
      data: cachedData,
      fetchedAt: Date.now(),
    });

    fetchForecastForTrip = await loadModule();
    const result = await fetchForecastForTrip('Paris', '2026-03-11', '2026-03-11');
    expect(result).toEqual(cachedData);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ignores expired cache', async () => {
    localStorage.store.runway_forecast_cache = JSON.stringify({
      key: 'Paris|2026-03-11|2026-03-11',
      data: [{ date: '2026-03-11', weatherCode: 0, tempMax: 15, tempMin: 8 }],
      fetchedAt: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago, past 2-hour TTL
    });

    const geoResponse = {
      ok: true,
      json: async () => ({ results: [{ name: 'Paris', latitude: 48.85, longitude: 2.35 }] }),
    };
    const forecastResponse = {
      ok: true,
      json: async () => ({
        daily: {
          time: ['2026-03-11'],
          weathercode: [3],
          temperature_2m_max: [12.0],
          temperature_2m_min: [5.0],
        },
      }),
    };

    fetch.mockResolvedValueOnce(geoResponse).mockResolvedValueOnce(forecastResponse);
    fetchForecastForTrip = await loadModule();

    const result = await fetchForecastForTrip('Paris', '2026-03-11', '2026-03-11');
    expect(result[0].weatherCode).toBe(3);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
