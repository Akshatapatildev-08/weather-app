const API_KEY = import.meta.env.VITE_WEATHERSTACK_API_KEY || 'eaeab95b1fa26be9da694b9454fdf974';
const BASE_URL =
  import.meta.env.VITE_WEATHERSTACK_BASE_URL ||
  (import.meta.env.DEV ? '/api/weatherstack' : 'https://api.weatherstack.com');
const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const OPEN_METEO_MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const OPEN_METEO_GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

function formatApiError(error = {}) {
  const code = Number(error.code);

  if (code === 105) {
    return 'This Weatherstack plan does not allow the marine endpoint.';
  }

  if (code === 603) {
    return 'This Weatherstack plan does not allow historical weather.';
  }

  if (code === 104) {
    return 'API request limit reached. Wait for reset and try again.';
  }

  if (code === 101) {
    return 'Invalid Weatherstack API key.';
  }

  if (code === 615) {
    return 'Location lookup failed. Check spelling (example: Bangalore, India).';
  }

  return error.info || 'Weatherstack API error';
}

function shouldFallback(err) {
  const code = Number(err?.code);
  const status = Number(err?.status);
  return (
    code === 105 ||
    code === 603 ||
    code === 104 ||
    code === 615 ||
    status === 429 ||
    String(err?.message || '').toLowerCase().includes('invalid response from weatherstack')
  );
}

function weatherCodeToText(code) {
  const map = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Rime fog',
    51: 'Light drizzle',
    53: 'Drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Snow',
    75: 'Heavy snow',
    80: 'Rain showers',
    81: 'Rain showers',
    82: 'Heavy rain showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with hail',
    99: 'Thunderstorm with hail',
  };
  return map[Number(code)] || 'Unknown';
}

async function request(endpoint, params = {}) {
  const query = new URLSearchParams({
    access_key: API_KEY,
    ...params,
  });

  let response = null;
  try {
    response = await fetch(`${BASE_URL}${endpoint}?${query.toString()}`);
  } catch {
    throw new Error('Unable to reach Weatherstack. Ensure dev server is running and try again.');
  }
  let data = null;

  try {
    data = await response.json();
  } catch {
    throw new Error('Invalid response from Weatherstack.');
  }

  if (!response.ok) {
    const apiInfo = data?.error?.info;
    const message =
      response.status === 429
        ? 'API rate limit reached. Try again shortly.'
        : apiInfo || `Weather request failed (HTTP ${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  if (data?.success === false) {
    const error = new Error(formatApiError(data?.error));
    error.code = data?.error?.code;
    error.type = data?.error?.type;
    throw error;
  }

  return data;
}

async function requestOpenMeteo(url, params = {}) {
  const query = new URLSearchParams(params);
  let response = null;
  try {
    response = await fetch(`${url}?${query.toString()}`);
  } catch {
    throw new Error('Unable to reach fallback weather provider.');
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error('Invalid response from fallback weather provider.');
  }

  if (!response.ok) {
    throw new Error(`Fallback weather request failed (HTTP ${response.status}).`);
  }

  return data;
}

export function getCurrent(query) {
  return getCurrentWithFallback(query);
}

async function geocodeOpenMeteo(query) {
  const data = await requestOpenMeteo(OPEN_METEO_GEOCODE_URL, {
    name: query,
    count: '1',
    language: 'en',
    format: 'json',
  });
  return data?.results?.[0] || null;
}

async function getCurrentWithFallback(query) {
  try {
    return await request('/current', { query });
  } catch (err) {
    if (!shouldFallback(err)) {
      throw err;
    }
  }

  const place = await geocodeOpenMeteo(query);
  if (!place?.latitude || !place?.longitude) {
    throw new Error('Unable to resolve location from fallback weather provider.');
  }

  const data = await requestOpenMeteo(OPEN_METEO_FORECAST_URL, {
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
    timezone: 'auto',
  });

  return {
    request: { source: 'open-meteo-fallback' },
    location: {
      name: place.name,
      country: place.country || '',
      region: place.admin1 || '',
      lat: String(place.latitude),
      lon: String(place.longitude),
      timezone_id: data?.timezone || place.timezone || 'auto',
      localtime: new Date().toISOString().slice(0, 16).replace('T', ' '),
      utc_offset: '',
    },
    current: {
      observation_time: new Date().toLocaleTimeString(),
      temperature: data?.current?.temperature_2m ?? 0,
      weather_descriptions: [weatherCodeToText(data?.current?.weather_code)],
      wind_speed: data?.current?.wind_speed_10m ?? 0,
      humidity: data?.current?.relative_humidity_2m ?? 0,
    },
  };
}

export async function getForecast(query, forecastDays = 5) {
  try {
    return await request('/forecast', { query, forecast_days: forecastDays });
  } catch (err) {
    if (!shouldFallback(err)) {
      throw err;
    }
  }

  const current = await getCurrentWithFallback(query);
  const lat = current?.location?.lat;
  const lon = current?.location?.lon;
  if (!lat || !lon) {
    throw new Error('Unable to resolve coordinates for forecast.');
  }

  const data = await requestOpenMeteo(OPEN_METEO_FORECAST_URL, {
    latitude: lat,
    longitude: lon,
    daily: 'weathercode,temperature_2m_max,temperature_2m_min',
    forecast_days: String(forecastDays),
    timezone: 'auto',
  });

  const forecast = {};
  const dates = data?.daily?.time || [];
  dates.forEach((date, i) => {
    forecast[date] = {
      date,
      maxtemp: data.daily.temperature_2m_max?.[i],
      mintemp: data.daily.temperature_2m_min?.[i],
      hourly: [
        {
          weather_descriptions: [weatherCodeToText(data.daily.weathercode?.[i])],
        },
      ],
    };
  });

  return {
    request: { source: 'open-meteo-fallback' },
    location: current.location,
    forecast,
  };
}

export async function getHistorical(query, date) {
  try {
    return await request('/historical', {
      query,
      historical_date: date,
    });
  } catch (err) {
    if (!shouldFallback(err)) {
      throw err;
    }
  }

  const current = await getCurrentWithFallback(query);
  const lat = current?.location?.lat;
  const lon = current?.location?.lon;
  if (!lat || !lon) {
    throw new Error('Unable to resolve coordinates for historical weather.');
  }

  const data = await requestOpenMeteo(OPEN_METEO_ARCHIVE_URL, {
    latitude: lat,
    longitude: lon,
    start_date: date,
    end_date: date,
    daily: 'weathercode,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
  });

  const dateValue = data?.daily?.time?.[0];
  const historical = {};
  if (dateValue) {
    historical[dateValue] = {
      maxtemp: data.daily.temperature_2m_max?.[0],
      mintemp: data.daily.temperature_2m_min?.[0],
      hourly: [
        {
          weather_descriptions: [weatherCodeToText(data.daily.weathercode?.[0])],
        },
      ],
    };
  }

  return {
    request: { source: 'open-meteo-fallback' },
    location: current.location,
    historical,
  };
}

export async function getMarine(latitude, longitude, date) {
  const params = { latitude, longitude, hourly: 1, tide: 'yes' };
  if (date) {
    params.date = date;
  }

  try {
    return await request('/marine', params);
  } catch (err) {
    if (!shouldFallback(err)) {
      throw err;
    }
  }

  const data = await requestOpenMeteo(OPEN_METEO_MARINE_URL, {
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: 'sea_surface_temperature,wave_height,swell_wave_height',
    start_date: date,
    end_date: date,
    timezone: 'auto',
  });

  const marine = {};
  const day = date || data?.hourly?.time?.[0]?.slice(0, 10);
  if (day) {
    marine[day] = {
      hourly: [
        {
          waterTemperature: data?.hourly?.sea_surface_temperature?.[0],
          swellHeight: data?.hourly?.swell_wave_height?.[0] ?? data?.hourly?.wave_height?.[0],
        },
      ],
    };
  }

  return {
    request: { source: 'open-meteo-fallback' },
    marine,
  };
}
