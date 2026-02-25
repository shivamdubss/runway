import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Tests for buildWeatherSection (pure function, no mocks needed) ---

import { buildWeatherSection } from '../api/_lib/prompts.js';

describe('buildWeatherSection', () => {
  it('returns null when weather is null', () => {
    expect(buildWeatherSection(null)).toBeNull();
  });

  it('returns null when weather is undefined', () => {
    expect(buildWeatherSection(undefined)).toBeNull();
  });

  it('returns null when weather has no temp', () => {
    expect(buildWeatherSection({ city: 'NYC' })).toBeNull();
  });

  it('includes city, temp, and condition', () => {
    const weather = {
      temp: 72,
      feelsLike: 70,
      high: 78,
      low: 65,
      condition: 'clear sky',
      wind: 5,
      city: 'New York',
    };
    const result = buildWeatherSection(weather);
    expect(result).toContain('New York');
    expect(result).toContain('72°F');
    expect(result).toContain('clear sky');
    expect(result).toContain('65°F – 78°F');
    expect(result).toContain('5 mph');
  });

  it('includes weather-appropriate guidance text', () => {
    const weather = { temp: 45, condition: 'rain', city: 'Seattle', wind: 12, high: 48, low: 42 };
    const result = buildWeatherSection(weather);
    expect(result).toContain('Factor this weather');
    expect(result).toContain('water-resistant');
  });

  it('omits wind line when wind is 0', () => {
    const weather = { temp: 80, condition: 'sunny', city: 'Miami', wind: 0, high: 85, low: 75 };
    const result = buildWeatherSection(weather);
    expect(result).not.toContain('Wind:');
  });
});

// --- Tests for buildSystemPrompt with weather integration ---

import { buildSystemPrompt } from '../api/_lib/prompts.js';

describe('buildSystemPrompt weather integration', () => {
  const baseItems = [{ name: 'White T-Shirt', category: 'Tops' }];

  it('does not include weather section when weather is null', () => {
    const prompt = buildSystemPrompt({ wardrobeItems: baseItems, profile: null, weather: null });
    expect(prompt).not.toContain('Current weather context');
  });

  it('does not include weather section when weather is undefined', () => {
    const prompt = buildSystemPrompt({ wardrobeItems: baseItems, profile: null });
    expect(prompt).not.toContain('Current weather context');
  });

  it('includes weather section when weather is provided', () => {
    const weather = { temp: 55, condition: 'overcast clouds', city: 'Chicago', wind: 15, high: 60, low: 50 };
    const prompt = buildSystemPrompt({ wardrobeItems: baseItems, profile: null, weather });
    expect(prompt).toContain('## Current weather context');
    expect(prompt).toContain('Chicago');
    expect(prompt).toContain('55°F');
    expect(prompt).toContain('overcast clouds');
  });

  it('places weather section after profile section', () => {
    const profile = {
      body: { bodyType: 'athletic' },
      style: {},
      styleContext: {},
    };
    const weather = { temp: 70, condition: 'sunny', city: 'LA', wind: 3, high: 75, low: 65 };
    const prompt = buildSystemPrompt({ wardrobeItems: baseItems, profile, weather });

    const profileIdx = prompt.indexOf('## User profile');
    const weatherIdx = prompt.indexOf('## Current weather context');
    const schemaIdx = prompt.indexOf('## Response JSON schema');

    expect(profileIdx).toBeGreaterThan(-1);
    expect(weatherIdx).toBeGreaterThan(profileIdx);
    expect(schemaIdx).toBeGreaterThan(weatherIdx);
  });
});

// --- Tests for fetchWeather (server-side, requires fetch mock) ---

describe('fetchWeather', () => {
  const originalEnv = process.env.OPENWEATHERMAP_API_KEY;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.OPENWEATHERMAP_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnv !== undefined) {
      process.env.OPENWEATHERMAP_API_KEY = originalEnv;
    } else {
      delete process.env.OPENWEATHERMAP_API_KEY;
    }
  });

  it('returns null when API key is not set', async () => {
    delete process.env.OPENWEATHERMAP_API_KEY;
    // Re-import to pick up env change
    const { fetchWeather } = await import('../api/_lib/weather.js');
    const result = await fetchWeather('New York');
    expect(result).toBeNull();
  });

  it('returns null when city is empty', async () => {
    const { fetchWeather } = await import('../api/_lib/weather.js');
    expect(await fetchWeather('')).toBeNull();
    expect(await fetchWeather(null)).toBeNull();
    expect(await fetchWeather(undefined)).toBeNull();
  });

  it('returns weather data on successful API response', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        main: { temp: 72.4, feels_like: 70.1, temp_max: 78.2, temp_min: 65.3, humidity: 45 },
        weather: [{ description: 'clear sky', icon: '01d' }],
        wind: { speed: 5.7 },
        name: 'New York',
      }),
    }));

    const { fetchWeather } = await import('../api/_lib/weather.js');
    const result = await fetchWeather('New York');

    expect(result).toEqual({
      temp: 72,
      feelsLike: 70,
      high: 78,
      low: 65,
      condition: 'clear sky',
      icon: '01d',
      wind: 6,
      humidity: 45,
      city: 'New York',
    });
  });

  it('returns null on non-ok response', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));

    const { fetchWeather } = await import('../api/_lib/weather.js');
    const result = await fetchWeather('InvalidCity');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

    const { fetchWeather } = await import('../api/_lib/weather.js');
    const result = await fetchWeather('New York');
    expect(result).toBeNull();
  });

  it('calls OpenWeatherMap with correct URL and imperial units', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        main: { temp: 50, feels_like: 48, temp_max: 55, temp_min: 45, humidity: 60 },
        weather: [{ description: 'rain', icon: '10d' }],
        wind: { speed: 10 },
        name: 'Seattle',
      }),
    }));

    const { fetchWeather } = await import('../api/_lib/weather.js');
    await fetchWeather('Seattle');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('api.openweathermap.org');
    expect(url).toContain('q=Seattle');
    expect(url).toContain('units=imperial');
    expect(url).toContain('appid=test-key');
  });
});
