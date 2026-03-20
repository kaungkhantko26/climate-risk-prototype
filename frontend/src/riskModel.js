export const sampleAlerts = () => [
  predictRisk({
    location: 'Hlegu',
    crop: 'Rice',
    rainfall_mm_next_3_days: 180,
    temperature_c: 31,
    soil_moisture_pct: 84,
    wind_kph: 18,
  }),
  predictRisk({
    location: 'Magway',
    crop: 'Sesame',
    rainfall_mm_next_3_days: 12,
    temperature_c: 39,
    soil_moisture_pct: 21,
    wind_kph: 14,
  }),
  predictRisk({
    location: 'Bago',
    crop: 'Pulses',
    rainfall_mm_next_3_days: 95,
    temperature_c: 30,
    soil_moisture_pct: 65,
    wind_kph: 52,
  }),
]

export const predictRisk = (data) => {
  const rainfall = data.rainfall_mm_next_3_days
  const temp = data.temperature_c
  const moisture = data.soil_moisture_pct
  const wind = data.wind_kph

  let risk = 'Moderate Climate Risk'
  let confidence = 68
  let timing = 'Next 5 days'
  let advice = 'Continue monitoring conditions and prepare basic protective measures.'

  if (rainfall >= 140 && moisture >= 70) {
    risk = 'High Flood Risk'
    confidence = Math.min(95, Math.floor(65 + rainfall / 5))
    timing = 'Next 72 hours'
    advice = 'Delay planting and move fertilizer or tools to higher ground.'
  } else if (rainfall <= 20 && temp >= 36) {
    risk = 'High Drought Risk'
    confidence = Math.min(92, Math.floor(60 + temp))
    timing = 'Next 7-10 days'
    advice = 'Prepare irrigation, mulch soil, and reduce non-essential water use.'
  } else if (wind >= 45 || rainfall >= 90) {
    risk = 'Storm Warning'
    confidence = Math.min(90, Math.floor(58 + wind / 2))
    timing = 'Next 48 hours'
    advice = 'Secure seedlings, avoid fertilizer application, and protect stored harvest.'
  }

  return {
    location: data.location,
    crop: data.crop,
    risk,
    confidence,
    timing,
    advice,
    sms: `${risk} in ${data.location} for ${data.crop}. ${advice} Forecast window: ${timing}.`,
  }
}
