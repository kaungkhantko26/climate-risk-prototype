const demoProfiles = {
  hlegu: {
    current_temperature_c: 29,
    current_humidity_pct: 78,
    rainfall_mm_next_3_days: 118,
    max_temperature_c_next_3_days: 32,
    max_wind_kph_next_3_days: 24,
    avg_soil_moisture_pct: 42,
    latitude: 17.12,
    longitude: 96.25,
    timezone: 'Asia/Yangon',
    forecast_time: null,
  },
  magway: {
    current_temperature_c: 37,
    current_humidity_pct: 38,
    rainfall_mm_next_3_days: 8,
    max_temperature_c_next_3_days: 39,
    max_wind_kph_next_3_days: 18,
    avg_soil_moisture_pct: 16,
    latitude: 20.15,
    longitude: 94.95,
    timezone: 'Asia/Yangon',
    forecast_time: null,
  },
  bago: {
    current_temperature_c: 30,
    current_humidity_pct: 72,
    rainfall_mm_next_3_days: 82,
    max_temperature_c_next_3_days: 30,
    max_wind_kph_next_3_days: 49,
    avg_soil_moisture_pct: 28,
    latitude: 17.33,
    longitude: 96.48,
    timezone: 'Asia/Yangon',
    forecast_time: null,
  },
  yangon: {
    current_temperature_c: 31,
    current_humidity_pct: 76,
    rainfall_mm_next_3_days: 54,
    max_temperature_c_next_3_days: 33,
    max_wind_kph_next_3_days: 26,
    avg_soil_moisture_pct: 34,
    latitude: 16.87,
    longitude: 96.2,
    timezone: 'Asia/Yangon',
    forecast_time: null,
  },
  mandalay: {
    current_temperature_c: 36,
    current_humidity_pct: 35,
    rainfall_mm_next_3_days: 10,
    max_temperature_c_next_3_days: 38,
    max_wind_kph_next_3_days: 23,
    avg_soil_moisture_pct: 18,
    latitude: 21.97,
    longitude: 96.08,
    timezone: 'Asia/Yangon',
    forecast_time: null,
  },
}

const hashString = (value) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

const createDemoWeather = (location) => {
  const normalized = location.trim().toLowerCase()
  const knownProfile = Object.entries(demoProfiles).find(([key]) => normalized.includes(key))
  if (knownProfile) {
    return { ...knownProfile[1] }
  }

  const seed = hashString(normalized || 'demo-location')
  const profileType = seed % 3

  if (profileType === 0) {
    return {
      current_temperature_c: 30,
      current_humidity_pct: 74,
      rainfall_mm_next_3_days: 102,
      max_temperature_c_next_3_days: 32,
      max_wind_kph_next_3_days: 27,
      avg_soil_moisture_pct: 38,
      latitude: null,
      longitude: null,
      timezone: 'Demo profile',
      forecast_time: null,
    }
  }

  if (profileType === 1) {
    return {
      current_temperature_c: 37,
      current_humidity_pct: 36,
      rainfall_mm_next_3_days: 9,
      max_temperature_c_next_3_days: 38,
      max_wind_kph_next_3_days: 20,
      avg_soil_moisture_pct: 17,
      latitude: null,
      longitude: null,
      timezone: 'Demo profile',
      forecast_time: null,
    }
  }

  return {
    current_temperature_c: 30,
    current_humidity_pct: 69,
    rainfall_mm_next_3_days: 76,
    max_temperature_c_next_3_days: 31,
    max_wind_kph_next_3_days: 46,
    avg_soil_moisture_pct: 27,
    latitude: null,
    longitude: null,
    timezone: 'Demo profile',
    forecast_time: null,
  }
}

const buildSms = (location, crop, risk, advice, weather) => {
  const rain = Math.round(weather.rainfall_mm_next_3_days)
  const wind = Math.round(weather.max_wind_kph_next_3_days)
  return `${risk} for ${crop} near ${location}. Rain next 3 days: ${rain} mm. Max wind: ${wind} kph. ${advice}`
}

const buildAlert = ({ location, crop, weather, source }) => {
  const rainfall = weather.rainfall_mm_next_3_days
  const temp = weather.max_temperature_c_next_3_days
  const moisture = weather.avg_soil_moisture_pct
  const wind = weather.max_wind_kph_next_3_days

  let risk = 'Moderate Climate Risk'
  let confidence = Math.min(84, Math.floor(62 + rainfall / 12 + wind / 12))
  let timing = 'Next 5 days'
  let advice = 'Keep monitoring the forecast, maintain field drainage, and prepare basic crop protection for changing conditions.'

  if (rainfall >= 90 && moisture >= 35) {
    risk = 'High Flood Risk'
    confidence = Math.min(96, Math.floor(60 + rainfall / 4 + Math.max(moisture - 30, 0)))
    timing = 'Next 72 hours'
    advice = 'Move inputs to higher ground, clear drainage channels, and delay field work until runoff eases.'
  } else if (rainfall <= 15 && temp >= 35 && moisture <= 20) {
    risk = 'High Drought Risk'
    confidence = Math.min(94, Math.floor(56 + temp + Math.max(20 - moisture, 0) + Math.max(15 - rainfall, 0) / 2))
    timing = 'Next 72 hours'
    advice = 'Prepare irrigation, mulch exposed soil, and reduce transplanting or fertilizer application during peak heat.'
  } else if (wind >= 45 || rainfall >= 70) {
    risk = 'Storm Warning'
    confidence = Math.min(93, Math.floor(58 + wind / 1.8 + rainfall / 8))
    timing = 'Next 48 hours'
    advice = 'Secure seedlings, avoid spraying or fertilizer application, and protect stored harvest from gusts and heavy showers.'
  }

  return {
    location,
    crop,
    risk,
    confidence,
    timing,
    advice,
    sms: buildSms(location, crop, risk, advice, weather),
    source,
    weather,
  }
}

export const buildDemoAlert = ({ location, crop }) =>
  buildAlert({
    location,
    crop,
    weather: createDemoWeather(location),
    source: 'Demo weather profile',
  })

export const sampleAlerts = () => [
  buildDemoAlert({ location: 'Hlegu', crop: 'Rice' }),
  buildDemoAlert({ location: 'Magway', crop: 'Sesame' }),
  buildDemoAlert({ location: 'Bago', crop: 'Pulses' }),
]
