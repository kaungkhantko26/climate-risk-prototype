import { useEffect, useMemo, useState } from 'react'

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')
).replace(/\/$/, '')

const cropOptions = ['Rice', 'Sesame', 'Pulses', 'Maize', 'Groundnut', 'Vegetables']
const quickLocations = ['Hlegu', 'Magway', 'Bago', 'Yangon', 'Mandalay', 'Nay Pyi Taw']

const badgeClass = (risk) => {
  if (risk.includes('Flood')) return 'bg-red-100 text-red-700 border-red-200'
  if (risk.includes('Drought')) return 'bg-orange-100 text-orange-700 border-orange-200'
  if (risk.includes('Storm')) return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-blue-100 text-blue-700 border-blue-200'
}

const defaultForm = {
  location: 'Hlegu',
  crop: 'Rice',
}

const formatValue = (value, unit, digits = 0) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'Unavailable'
  return `${Number(value).toFixed(digits)}${unit}`
}

const formatCoordinates = (weather) => {
  if (weather?.latitude === null || weather?.latitude === undefined) return 'Unavailable'
  return `${weather.latitude.toFixed(2)}, ${weather.longitude.toFixed(2)}`
}

const readErrorMessage = async (response, fallbackMessage) => {
  try {
    const payload = await response.json()
    return payload?.detail || fallbackMessage
  } catch {
    return fallbackMessage
  }
}

export default function App() {
  const [alerts, setAlerts] = useState([])
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [generatedAlert, setGeneratedAlert] = useState(null)
  const [status, setStatus] = useState('Loading live Myanmar watchlist...')

  useEffect(() => {
    let cancelled = false

    const loadAlerts = async () => {
      if (!API_BASE) {
        if (cancelled) return
        setAlerts([])
        setSelectedAlert(null)
        setStatus('Live backend URL is not configured. Set VITE_API_BASE_URL to enable Myanmar weather detection.')
        return
      }

      try {
        const response = await fetch(`${API_BASE}/sample-alerts`)
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, 'Could not load live Myanmar watchlist.'))
        }

        const data = await response.json()
        const nextAlerts = data.alerts || []
        if (cancelled) return
        setAlerts(nextAlerts)
        setSelectedAlert(nextAlerts[0] || null)
        setStatus('Live Myanmar weather detection is connected.')
      } catch (error) {
        if (cancelled) return
        setAlerts([])
        setSelectedAlert(null)
        setStatus(error.message || 'Could not load live Myanmar watchlist.')
      }
    }

    loadAlerts()

    return () => {
      cancelled = true
    }
  }, [])

  const currentAlert = useMemo(() => generatedAlert || selectedAlert, [generatedAlert, selectedAlert])

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const runPrediction = async (event) => {
    event.preventDefault()
    const payload = {
      location: form.location.trim(),
      crop: form.crop,
    }

    if (!payload.location) {
      setStatus('Enter a Myanmar location to detect live climate risk.')
      return
    }

    if (!API_BASE) {
      setGeneratedAlert(null)
      setStatus('Live backend URL is not configured. Set VITE_API_BASE_URL first.')
      return
    }

    setStatus(`Checking live Myanmar forecast for ${payload.location}...`)

    try {
      const response = await fetch(`${API_BASE}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Live weather lookup failed.'))
      }

      const data = await response.json()
      setGeneratedAlert(data)
      setStatus(`Live Myanmar forecast loaded for ${data.location}.`)
    } catch (error) {
      setGeneratedAlert(null)
      setStatus(error.message || 'Live weather lookup failed.')
    }
  }

  const weatherCards = currentAlert?.weather
    ? [
        {
          label: 'Current Temp',
          value: formatValue(currentAlert.weather.current_temperature_c, '°C', 1),
        },
        {
          label: 'Humidity',
          value: formatValue(currentAlert.weather.current_humidity_pct, '%'),
        },
        {
          label: 'Rain Next 3 Days',
          value: formatValue(currentAlert.weather.rainfall_mm_next_3_days, ' mm', 1),
        },
        {
          label: 'Max Temp Next 3 Days',
          value: formatValue(currentAlert.weather.max_temperature_c_next_3_days, '°C', 1),
        },
        {
          label: 'Max Wind',
          value: formatValue(currentAlert.weather.max_wind_kph_next_3_days, ' kph', 1),
        },
        {
          label: 'Avg Soil Moisture',
          value: formatValue(currentAlert.weather.avg_soil_moisture_pct, '%', 1),
        },
      ]
    : []

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <p className="text-sm font-semibold tracking-wide uppercase text-emerald-700">Myanmar Live Weather Monitor</p>
              <h1 className="text-4xl md:text-5xl font-bold mt-2">Real-World Climate Risk Detection</h1>
              <p className="mt-4 text-slate-600 max-w-3xl">
                Enter a Myanmar city, township, district, or regional capital. The backend resolves the location inside Myanmar only, fetches live three-day forecast data, and turns it into climate risk guidance.
              </p>
            </div>
            <div className="bg-slate-100 rounded-2xl px-4 py-3 text-sm border border-slate-200 max-w-sm">
              <span className="font-semibold">System status:</span> {status}
            </div>
          </div>
        </header>

        <section className="grid xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-5 gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">Live Myanmar Watchlist</h2>
                  <p className="text-slate-600 mt-1">These alerts come from live forecast data only. If the backend or weather provider is unavailable, this section stays empty instead of using demo data.</p>
                </div>
              </div>
              {alerts.length > 0 ? (
                <div className="space-y-4">
                  {alerts.map((alert, index) => (
                    <button
                      key={`${alert.location}-${index}`}
                      type="button"
                      onClick={() => {
                        setSelectedAlert(alert)
                        setGeneratedAlert(null)
                      }}
                      className="w-full text-left rounded-2xl border border-slate-200 p-5 bg-slate-50 hover:bg-slate-100 transition"
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold">{alert.location} • {alert.crop}</div>
                          <div className="text-sm text-slate-500 mt-1">
                            Rain {formatValue(alert.weather?.rainfall_mm_next_3_days, ' mm', 1)} • Wind {formatValue(alert.weather?.max_wind_kph_next_3_days, ' kph', 1)}
                          </div>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${badgeClass(alert.risk)}`}>
                          {alert.risk}
                        </span>
                      </div>
                      <p className="mt-3 text-slate-700">{alert.advice}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-slate-600">
                  No live watchlist data yet. Check the backend deployment or try again in a moment.
                </div>
              )}
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-2xl font-semibold">Detect Live Climate Risk</h2>
              <p className="text-slate-600 mt-1">Search real Myanmar places only. Example inputs: Hlegu, Magway, Bago, Yangon, Mandalay, Nay Pyi Taw.</p>
              <form className="mt-5 grid md:grid-cols-2 gap-4" onSubmit={runPrediction}>
                <label className="block md:col-span-2">
                  <span className="text-sm font-medium text-slate-700">Myanmar Location</span>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(event) => updateField('location', event.target.value)}
                    placeholder="e.g. Hlegu, Yangon, Nay Pyi Taw"
                    className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-3 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Crop</span>
                  <select
                    value={form.crop}
                    onChange={(event) => updateField('crop', event.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-300 px-4 py-3 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {cropOptions.map((crop) => (
                      <option key={crop} value={crop}>{crop}</option>
                    ))}
                  </select>
                </label>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-sm font-medium text-slate-700">Quick picks</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {quickLocations.map((location) => (
                      <button
                        key={location}
                        type="button"
                        onClick={() => updateField('location', location)}
                        className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-white"
                      >
                        {location}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2 flex items-center justify-between gap-4">
                  <p className="text-sm text-slate-500">
                    This workflow is live-only. If the backend cannot geocode the Myanmar location or reach weather services, the UI will show the real error instead of replacing it with demo data.
                  </p>
                  <button className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 font-semibold shadow-sm shrink-0">
                    Detect Risk
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-2xl font-semibold">Selected Alert</h2>
              {currentAlert ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="text-lg font-semibold">{currentAlert.location} • {currentAlert.crop}</div>
                    <div className="text-sm text-slate-500 mt-1">Forecast window: {currentAlert.timing}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${badgeClass(currentAlert.risk)}`}>
                      {currentAlert.risk}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm text-slate-700">
                      {currentAlert.source}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                      <div className="text-sm text-slate-500">Confidence</div>
                      <div className="text-3xl font-bold mt-1">{currentAlert.confidence}%</div>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                      <div className="text-sm text-slate-500">Coordinates</div>
                      <div className="text-lg font-bold mt-1">{formatCoordinates(currentAlert.weather)}</div>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                    <div className="text-sm text-slate-500">Advice</div>
                    <div className="mt-1 font-medium">{currentAlert.advice}</div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-slate-600">Select a live watchlist alert or run a Myanmar location search.</p>
              )}
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-2xl font-semibold">Weather Snapshot</h2>
              {currentAlert?.weather ? (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {weatherCards.map((card) => (
                      <div key={card.label} className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                        <div className="text-sm text-slate-500">{card.label}</div>
                        <div className="mt-1 text-2xl font-bold">{card.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600">
                    <div>Timezone: {currentAlert.weather.timezone || 'Unavailable'}</div>
                    <div className="mt-1">Forecast timestamp: {currentAlert.weather.forecast_time || 'Unavailable'}</div>
                  </div>
                </>
              ) : (
                <p className="mt-4 text-slate-600">Live weather metrics will appear after a successful lookup.</p>
              )}
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-2xl font-semibold">SMS Preview</h2>
              <div className="mt-4 rounded-3xl bg-slate-900 text-white p-5 shadow-inner min-h-40">
                <div className="text-xs uppercase tracking-wide text-slate-400">Farmer Alert</div>
                <p className="mt-3 text-sm leading-6">{currentAlert ? currentAlert.sms : 'Run a live Myanmar risk check to generate the SMS message.'}</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-3xl shadow-sm p-6 text-white">
              <h2 className="text-2xl font-semibold">How It Works</h2>
              <ol className="mt-4 space-y-2 text-emerald-50 list-decimal list-inside">
                <li>Enter a Myanmar location and crop</li>
                <li>Backend geocodes the place inside Myanmar only</li>
                <li>Live forecast data is fetched and translated into flood, drought, or storm risk</li>
                <li>Farmer advice and SMS text are generated from the real weather snapshot</li>
              </ol>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
