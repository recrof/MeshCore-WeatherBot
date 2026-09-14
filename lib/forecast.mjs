/**
 * Weather Forecast Bot - Open-Meteo API
 * Fetches today's forecast and returns condensed emoji text.
 *
 * Usage:
 *   import { getTodaysForecast } from './forecast.mjs';
 *   const text = await getTodaysForecast();
 *   const text = await getTodaysForecast({ latitude: 48.15, longitude: 17.11, name: 'Bratislava' });
 */

const WEATHER_EMOJIS = {
  0: '☀️',        // Clear sky
  1: '🌤️',       // Mainly clear
  2: '⛅',        // Partly cloudy
  3: '☁️',        // Overcast
  45: '🌫️',      // Fog
  48: '🌫️❄️',    // Depositing rime fog
  51: '🌦️',      // Light drizzle
  53: '🌦️',      // Moderate drizzle
  55: '🌧️',      // Dense drizzle
  56: '🌧️❄️',    // Light freezing drizzle
  57: '🌧️❄️',    // Dense freezing drizzle
  61: '🌧️',      // Slight rain
  63: '🌧️',      // Moderate rain
  65: '🌧️🌧️',   // Heavy rain
  66: '🧊🌧️',    // Light freezing rain
  67: '🧊🌧️',    // Heavy freezing rain
  71: '🌨️',      // Slight snowfall
  73: '🌨️',      // Moderate snowfall
  75: '❄️❄️',    // Heavy snowfall
  77: '❄️',      // Snow grains
  80: '🌦️',      // Slight rain showers
  81: '🌧️',      // Moderate rain showers
  82: '⛈️',      // Violent rain showers
  85: '🌨️',      // Slight snow showers
  86: '❄️⛈️',    // Heavy snow showers
  95: '⛈️',      // Thunderstorm
  96: '⛈️🧊',    // Thunderstorm with slight hail
  99: '⛈️🧊',    // Thunderstorm with heavy hail
};

const WEATHER_DESCRIPTIONS = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  56: 'Freezing drizzle',
  57: 'Heavy freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Heavy showers',
  85: 'Light snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm + hail',
  99: 'Severe thunderstorm + hail',
};

const DEFAULT_LOCATION = {
  latitude: 48.1486,
  longitude: 17.1077,
  name: 'Bratislava',
};

const API_BASE = 'https://api.open-meteo.com/v1/forecast';

/**
 * Fetches today's weather forecast from Open-Meteo.
 *
 * @param {Object}  [options]
 * @param {number}  [options.latitude=48.1486]   - Location latitude
 * @param {number}  [options.longitude=17.1077]  - Location longitude
 * @param {string}  [options.name='Bratislava']  - Display name for the location
 * @param {string}  [options.timezone='Europe/Bratislava'] - IANA timezone
 * @returns {Promise<{ text: string, data: object }>} Formatted text + raw API data
 */
export async function getTodaysForecast({
  latitude = DEFAULT_LOCATION.latitude,
  longitude = DEFAULT_LOCATION.longitude,
  name = DEFAULT_LOCATION.name,
  timezone = 'Europe/Bratislava',
} = {}) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    timezone,
    forecast_days: '1',
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'apparent_temperature_max',
      'apparent_temperature_min',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
      'precipitation_sum',
      'precipitation_probability_max',
      'sunrise',
      'sunset',
    ].join(','),
    current: [
      'temperature_2m',
      'weather_code',
      'wind_speed_10m',
      'relative_humidity_2m',
    ].join(','),
  });

  const url = `${API_BASE}?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Open-Meteo API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const text = formatForecast(data, name);

  return { text, data };
}

/**
 * Formats the raw API response into condensed emoji text.
 */
function formatForecast(data, locationName) {
  const d = data.daily;

  const code = d.weather_code[0];
  const emoji = WEATHER_EMOJIS[code] ?? '🌡️';
  const desc = WEATHER_DESCRIPTIONS[code] ?? 'Unknown';

  const tMax = Math.round(d.temperature_2m_max[0]);
  const tMin = Math.round(d.temperature_2m_min[0]);

  const feelsMax = Math.round(d.apparent_temperature_max[0]);
  const feelsMin = Math.round(d.apparent_temperature_min[0]);
  const windMax = Math.round(d.wind_speed_10m_max[0]);
  const gustMax = Math.round(d.wind_gusts_10m_max[0]);
  const precip = d.precipitation_sum[0];
  const precipProb = d.precipitation_probability_max[0];
  const sunrise = formatTime(d.sunrise[0]);
  const sunset = formatTime(d.sunset[0]);

  const lines = [
    `${locationName} ${emoji}`,
    `🌡️ ▲${tMax}°C ▼${tMin}°C`,
    `🌬️ ${windMax} km/h (${gustMax} km/h)`,
  ];

  if (precip > 0 || precipProb > 20) {
    lines.push(`🌧️ ${precip} mm (${precipProb}% chance)`);
  }

  lines.push(`🌅 ${sunrise}  🌇 ${sunset}`);

  return lines.join('\n');
}

/**
 * Extracts HH:MM from an ISO timestamp.
 */
function formatTime(iso) {
  return iso?.slice(11, 16) ?? '--:--';
}
