/**
 * Fetch current weather for a city using OpenWeatherMap API.
 *
 * @param {string} city - City name (e.g., "New York")
 * @returns {Promise<Object|null>} Weather data or null on failure
 */
export async function fetchWeather(city) {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey || !city) return null;

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=imperial&appid=${apiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });

    if (!response.ok) return null;

    const data = await response.json();

    return {
      temp: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      high: Math.round(data.main.temp_max),
      low: Math.round(data.main.temp_min),
      condition: data.weather?.[0]?.description || '',
      icon: data.weather?.[0]?.icon || '',
      wind: Math.round(data.wind?.speed || 0),
      humidity: data.main.humidity,
      city: data.name,
    };
  } catch (error) {
    console.error('[weather] Failed to fetch weather:', error?.message || error);
    return null;
  }
}
