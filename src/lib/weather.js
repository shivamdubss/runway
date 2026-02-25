const CACHE_KEY = 'runway_weather_cache';
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
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=imperial&appid=${import.meta.env.VITE_OPENWEATHERMAP_API_KEY}`
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
