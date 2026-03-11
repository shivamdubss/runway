const CACHE_KEY = 'runway_weather_cache_metric';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch current weather for display purposes (client-side).
 * Results are cached in localStorage for 30 minutes.
 *
 * @param {string} city - City name
 * @returns {Promise<Object|null>} { temp, condition, icon, city } or null
 */
export async function fetchWeatherForDisplay(city) {
  if (!city) return null;

  // Check cache
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.city === city && Date.now() - parsed.fetchedAt < CACHE_TTL_MS) {
        return parsed.data;
      }
    }
  } catch { /* ignore corrupt cache */ }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${import.meta.env.VITE_OPENWEATHERMAP_API_KEY}`
    );
    if (!response.ok) return null;

    const raw = await response.json();
    const data = {
      temp: Math.round(raw.main.temp),
      condition: raw.weather?.[0]?.main || '',
      icon: raw.weather?.[0]?.icon || '',
      city: raw.name,
    };

    // Cache the result
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        city,
        data,
        fetchedAt: Date.now(),
      }));
    } catch { /* quota exceeded, ignore */ }

    return data;
  } catch {
    return null;
  }
}

/**
 * Search cities using Open-Meteo Geocoding API (free, no key required).
 *
 * @param {string} query - Partial city name (minimum 2 characters)
 * @returns {Promise<Array<{name: string, country: string, admin1: string}>>}
 */
export async function searchCities(query) {
  if (!query || query.trim().length < 2) return [];
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=5&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(r => ({
      name: r.name,
      country: r.country || '',
      admin1: r.admin1 || '',
    }));
  } catch {
    return [];
  }
}

/**
 * Detect user's location using the browser Geolocation API + Nominatim reverse geocoding.
 *
 * @returns {Promise<{name: string, country: string}>}
 * @throws {Error} If geolocation is unavailable, permission denied, or city cannot be resolved
 */
export async function detectLocationFromBrowser() {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser');
  }

  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
  });

  const { latitude, longitude } = position.coords;
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
  );
  if (!res.ok) throw new Error('Failed to reverse geocode location');

  const data = await res.json();
  const city =
    data.address?.city ||
    data.address?.town ||
    data.address?.village ||
    data.address?.county;
  const country = data.address?.country || '';

  if (!city) throw new Error('Could not determine city from your location');
  return { name: city, country };
}

/**
 * Map OpenWeatherMap icon code to a weather emoji.
 */
export function weatherIconToEmoji(icon) {
  if (!icon) return '';
  const map = {
    '01d': '☀️', '01n': '🌙',
    '02d': '⛅', '02n': '☁️',
    '03d': '☁️', '03n': '☁️',
    '04d': '☁️', '04n': '☁️',
    '09d': '🌧️', '09n': '🌧️',
    '10d': '🌦️', '10n': '🌧️',
    '11d': '⛈️', '11n': '⛈️',
    '13d': '🌨️', '13n': '🌨️',
    '50d': '🌫️', '50n': '🌫️',
  };
  return map[icon] || '🌡️';
}

/**
 * Map WMO weather code to an emoji (used by Open-Meteo API).
 */
export function wmoCodeToEmoji(code) {
  if (code == null) return '';
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌧️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌡️';
}

const FORECAST_CACHE_KEY = 'runway_forecast_cache';
const FORECAST_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Fetch daily weather forecast for a trip using Open-Meteo (free, no API key).
 *
 * @param {string} city - Destination city name
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<Array<{date: string, weatherCode: number, tempMax: number, tempMin: number}>|null>}
 */
export async function fetchForecastForTrip(city, startDate, endDate) {
  if (!city || !startDate || !endDate) return null;

  const cacheKey = `${city}|${startDate}|${endDate}`;

  // Check cache
  try {
    const cached = localStorage.getItem(FORECAST_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.key === cacheKey && Date.now() - parsed.fetchedAt < FORECAST_CACHE_TTL_MS) {
        return parsed.data;
      }
    }
  } catch { /* ignore corrupt cache */ }

  try {
    // Geocode city to get coordinates
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
    );
    if (!geoRes.ok) return null;
    const geoData = await geoRes.json();
    const loc = geoData.results?.[0];
    if (!loc) return null;

    // Fetch forecast
    const forecastRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${startDate}&end_date=${endDate}`
    );
    if (!forecastRes.ok) return null;
    const forecastData = await forecastRes.json();

    const dates = forecastData.daily?.time || [];
    const codes = forecastData.daily?.weathercode || [];
    const maxTemps = forecastData.daily?.temperature_2m_max || [];
    const minTemps = forecastData.daily?.temperature_2m_min || [];

    const data = dates.map((date, i) => ({
      date,
      weatherCode: codes[i],
      tempMax: Math.round(maxTemps[i]),
      tempMin: Math.round(minTemps[i]),
    }));

    // Cache the result
    try {
      localStorage.setItem(FORECAST_CACHE_KEY, JSON.stringify({
        key: cacheKey,
        data,
        fetchedAt: Date.now(),
      }));
    } catch { /* quota exceeded, ignore */ }

    return data;
  } catch {
    return null;
  }
}
