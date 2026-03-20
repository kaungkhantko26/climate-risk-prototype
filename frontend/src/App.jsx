import { useEffect, useMemo, useState } from 'react'

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')
).replace(/\/$/, '')

const cropOptions = ['Rice', 'Sesame', 'Pulses', 'Maize', 'Groundnut', 'Vegetables']
const quickLocations = ['Hlegu', 'Magway', 'Bago', 'Yangon', 'Mandalay', 'Nay Pyi Taw']

const sidebarLinks = [
  { icon: 'dashboard', label: 'ပင်မစာမျက်နှာ', active: true },
  { icon: 'notifications', label: 'သတိပေးချက်များ' },
  { icon: 'map', label: 'မြေပုံ' },
  { icon: 'menu_book', label: 'လမ်းညွှန်' },
]

const quickActions = [
  {
    icon: 'calendar_month',
    label: 'စိုက်ပျိုးပြက္ခဒိန်',
    iconClass: 'bg-primary-container text-primary',
  },
  {
    icon: 'radar',
    label: 'တိုင်းဒေသကြီး ရှာရန်',
    iconClass: 'bg-secondary-container text-on-secondary-container',
  },
  {
    icon: 'sms',
    label: 'SMS အချက်ပေး',
    iconClass: 'bg-tertiary/10 text-tertiary',
  },
  {
    icon: 'help',
    label: 'အကူအညီရယူရန်',
    iconClass: 'bg-primary/10 text-primary',
  },
]

const defaultForm = {
  location: 'Hlegu',
  crop: 'Rice',
}

const badgeClass = (risk) => {
  if (risk.includes('Flood')) return 'bg-red-100 text-red-700 border-red-200'
  if (risk.includes('Drought')) return 'bg-orange-100 text-orange-700 border-orange-200'
  if (risk.includes('Storm')) return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-blue-100 text-blue-700 border-blue-200'
}

const readErrorMessage = async (response, fallbackMessage) => {
  try {
    const payload = await response.json()
    return payload?.detail || fallbackMessage
  } catch {
    return fallbackMessage
  }
}

const formatValue = (value, unit, digits = 0) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'Unavailable'
  return `${Number(value).toFixed(digits)}${unit}`
}

const formatCoordinates = (weather) => {
  if (weather?.latitude === null || weather?.latitude === undefined) return 'Unavailable'
  return `${weather.latitude.toFixed(2)}, ${weather.longitude.toFixed(2)}`
}

const formatForecastTime = (value) => {
  if (!value) return 'အချိန်မရရှိသေးပါ'

  try {
    return new Intl.DateTimeFormat('my-MM', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

const getRiskMeta = (alert) => {
  if (!alert) {
    return {
      headline: 'စောင့်ကြည့်နေဆဲ',
      subline: 'ဒေတာချိတ်ဆက်မှုကို စစ်ဆေးနေပါသည်။',
      summary: 'မြန်မာနိုင်ငံအတွင်း ရာသီဥတုဒေတာများကို ထပ်မံစုဆောင်းနေဆဲဖြစ်ပါသည်။',
      icon: 'monitoring',
      badge: 'Live Feed',
      badgeClassName: 'bg-white/20 text-white',
      accentClass: 'bg-primary',
      iconPanelClass: 'bg-white/15 text-white',
    }
  }

  if (alert.risk.includes('Flood')) {
    return {
      headline: 'ရေကြီးနိုင်မှု မြင့်မားနေပါသည်',
      subline: `${alert.location} အတွက် စိုက်ခင်းကာကွယ်ရေး လိုအပ်နေပါသည်`,
      summary: `${alert.crop} စိုက်ခင်းအတွက် ၃ ရက်အတွင်း မိုးရေ ${formatValue(alert.weather?.rainfall_mm_next_3_days, ' mm', 1)} ရနိုင်ပြီး ရေတင်ခြင်းကို ကြိုတင်ကာကွယ်ရန် လိုအပ်ပါသည်။`,
      icon: 'flood',
      badge: 'Critical Alert',
      badgeClassName: 'bg-error text-on-error',
      accentClass: 'bg-error',
      iconPanelClass: 'bg-error-container text-error',
    }
  }

  if (alert.risk.includes('Drought')) {
    return {
      headline: 'အပူခြောက်သွေ့မှု သတိပေးချက်',
      subline: `${alert.location} တွင် ရေရှားပါးမှု စတင်မြင့်တက်နေပါသည်`,
      summary: `${alert.crop} အတွက် မိုးရေ ${formatValue(alert.weather?.rainfall_mm_next_3_days, ' mm', 1)} သာရှိပြီး အပူချိန် ${formatValue(alert.weather?.max_temperature_c_next_3_days, '°C', 1)} အထိ တက်နိုင်ပါသည်။`,
      icon: 'thermostat',
      badge: 'Critical Alert',
      badgeClassName: 'bg-error text-on-error',
      accentClass: 'bg-error',
      iconPanelClass: 'bg-error-container text-error',
    }
  }

  if (alert.risk.includes('Storm')) {
    return {
      headline: 'မိုးသက်လေပြင်း သတိပေးချက်',
      subline: `${alert.location} တွင် လေပြင်းနှင့် မိုးသက်ရောက်နိုင်ပါသည်`,
      summary: `${alert.crop} စိုက်ခင်းအတွက် အများဆုံးလေတိုက်နှုန်း ${formatValue(alert.weather?.max_wind_kph_next_3_days, ' kph', 1)} အထိ ရောက်နိုင်ပြီး အပြင်လုပ်ငန်းများကို လျှော့ချရန် သင့်တော်ပါသည်။`,
      icon: 'thunderstorm',
      badge: 'Moderate',
      badgeClassName: 'bg-secondary-container text-on-secondary-container',
      accentClass: 'bg-secondary',
      iconPanelClass: 'bg-secondary-container text-on-secondary-container',
    }
  }

  return {
    headline: 'အန္တရာယ် နည်းပါးပါသည်',
    subline: `${alert.location} တွင် စောင့်ကြည့်ရမည့် အခြေအနေသာ ရှိပါသည်`,
    summary: `${alert.crop} စိုက်ခင်းအတွက် လက်ရှိဒေတာအရ အန္တရာယ်မမြင့်သေးပါ။ သို့သော် ရာသီဥတုပြောင်းလဲမှုများကို ဆက်လက်စောင့်ကြည့်သင့်ပါသည်။`,
    icon: 'eco',
    badge: 'Low Risk',
    badgeClassName: 'bg-primary-container text-on-primary-container',
    accentClass: 'bg-primary',
    iconPanelClass: 'bg-primary-container text-primary',
  }
}

export default function App() {
  const [alerts, setAlerts] = useState([])
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [generatedAlert, setGeneratedAlert] = useState(null)
  const [status, setStatus] = useState('မြန်မာနိုင်ငံ ရာသီဥတုဒေတာများကို ချိတ်ဆက်နေပါသည်...')

  useEffect(() => {
    let cancelled = false

    const loadAlerts = async () => {
      if (!API_BASE) {
        if (cancelled) return
        setAlerts([])
        setSelectedAlert(null)
        setStatus('Live backend URL မသတ်မှတ်ရသေးပါ။ VITE_API_BASE_URL ကို ထည့်သွင်းပါ။')
        return
      }

      try {
        const response = await fetch(`${API_BASE}/sample-alerts`)
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, 'မြန်မာ watchlist ကို မရရှိနိုင်ပါ။'))
        }

        const data = await response.json()
        const nextAlerts = data.alerts || []
        if (cancelled) return
        setAlerts(nextAlerts)
        setSelectedAlert(nextAlerts[0] || null)
        setStatus('Live Myanmar weather detection ချိတ်ဆက်ပြီးပါပြီ။')
      } catch (error) {
        if (cancelled) return
        setAlerts([])
        setSelectedAlert(null)
        setStatus(error.message || 'Live weather data ကို မရရှိနိုင်ပါ။')
      }
    }

    loadAlerts()

    return () => {
      cancelled = true
    }
  }, [])

  const currentAlert = useMemo(() => generatedAlert || selectedAlert, [generatedAlert, selectedAlert])
  const currentMeta = useMemo(() => getRiskMeta(currentAlert), [currentAlert])

  const recentAlerts = useMemo(() => {
    const currentKey = currentAlert ? `${currentAlert.location}-${currentAlert.crop}-${currentAlert.risk}` : null
    return alerts
      .filter((alert) => `${alert.location}-${alert.crop}-${alert.risk}` !== currentKey)
      .slice(0, 3)
  }, [alerts, currentAlert])

  const weatherCards = currentAlert?.weather
    ? [
        {
          label: 'လက်ရှိ အပူချိန်',
          value: formatValue(currentAlert.weather.current_temperature_c, '°C', 1),
        },
        {
          label: 'လက်ရှိ စိုထိုင်းဆ',
          value: formatValue(currentAlert.weather.current_humidity_pct, '%'),
        },
        {
          label: '၃ ရက်အတွင်း မိုးရေ',
          value: formatValue(currentAlert.weather.rainfall_mm_next_3_days, ' mm', 1),
        },
        {
          label: 'အများဆုံး အပူချိန်',
          value: formatValue(currentAlert.weather.max_temperature_c_next_3_days, '°C', 1),
        },
        {
          label: 'အများဆုံး လေတိုက်နှုန်း',
          value: formatValue(currentAlert.weather.max_wind_kph_next_3_days, ' kph', 1),
        },
        {
          label: 'မြေစိုထိုင်းဆ ပျမ်းမျှ',
          value: formatValue(currentAlert.weather.avg_soil_moisture_pct, '%', 1),
        },
      ]
    : []

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
      setStatus('မြန်မာနိုင်ငံအတွင်း တည်နေရာတစ်ခုကို ထည့်သွင်းပါ။')
      return
    }

    if (!API_BASE) {
      setGeneratedAlert(null)
      setStatus('Live backend URL မသတ်မှတ်ရသေးပါ။')
      return
    }

    setStatus(`${payload.location} အတွက် live forecast ကို စစ်ဆေးနေပါသည်...`)

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
      setStatus(`${data.location} အတွက် live forecast ကို ရရှိပါပြီ။`)
    } catch (error) {
      setGeneratedAlert(null)
      setStatus(error.message || 'Live weather lookup failed.')
    }
  }

  const accountSyncLabel = alerts.length > 0 ? 'Live Sync On' : 'Sync Pending'
  const accountSyncClass = alerts.length > 0
    ? 'bg-primary-container text-on-primary-container'
    : 'bg-secondary-container text-on-secondary-container'

  return (
    <>
      <aside className="hidden md:flex fixed left-0 top-0 h-full z-40 flex-col bg-surface-container-low w-72 border-r border-outline/10">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-primary text-3xl">eco</span>
            <h1 className="text-xl font-bold text-primary tracking-tight font-headline leading-tight">Climate Monitor</h1>
          </div>
          <p className="text-on-surface-variant text-sm font-label opacity-70">စိုက်ပျိုးရေးအဖော်မွန်</p>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {sidebarLinks.map((item) => (
            <a
              key={item.label}
              className={
                item.active
                  ? 'flex items-center gap-4 bg-primary text-on-primary px-6 py-4 rounded-2xl shadow-lg transition-all font-headline'
                  : 'flex items-center gap-4 text-on-surface-variant px-6 py-4 hover:bg-surface-container rounded-2xl transition-all font-headline'
              }
              href="#"
            >
              <span
                className="material-symbols-outlined"
                style={item.active ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              <span className={item.active ? 'font-bold' : 'font-medium'}>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="p-6 border-t border-outline/10 space-y-4">
          <div className="rounded-3xl bg-surface-container p-4 border border-outline/10 shadow-[0_8px_28px_rgba(27,29,14,0.06)]">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined">person</span>
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold font-headline truncate">မောင်သက်ပိုင်</p>
                <p className="text-xs text-on-surface-variant font-label truncate">ဟလဲဂူမြို့နယ် • စပါး၊ နှမ်း စိုက်တောင်သူ</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-2xl bg-surface-container-high px-3 py-3">
                <div className="text-[11px] font-label text-on-surface-variant uppercase tracking-wide">လယ်ယာ</div>
                <div className="mt-1 font-headline font-bold text-on-surface">12 ဧက</div>
              </div>
              <div className="rounded-2xl bg-surface-container-high px-3 py-3">
                <div className="text-[11px] font-label text-on-surface-variant uppercase tracking-wide">အဓိကသီးနှံ</div>
                <div className="mt-1 font-headline font-bold text-on-surface">{currentAlert?.crop || 'Rice'}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`px-3 py-1 rounded-full text-[11px] font-bold font-label ${accountSyncClass}`}>
                {accountSyncLabel}
              </span>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold font-label bg-primary/10 text-primary">
                Last Check: {currentAlert?.location || 'Myanmar'}
              </span>
            </div>

            <button className="mt-4 w-full rounded-2xl border border-outline/10 bg-white px-4 py-3 text-sm font-headline font-bold text-primary hover:bg-primary hover:text-white transition-all">
              အကောင့်ပြင်ဆင်ရန်
            </button>
          </div>
        </div>
      </aside>

      <header className="bg-surface/80 backdrop-blur-lg border-b border-outline/10 fixed top-0 left-0 md:left-72 right-0 z-50">
        <div className="flex justify-between items-center px-6 h-20 w-full max-w-5xl mx-auto">
          <div className="flex items-center gap-4">
            <button className="md:hidden text-on-surface p-2 rounded-full hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined">menu</span>
            </button>
            <div>
              <h2 className="text-xl font-bold text-primary font-headline">ပင်မစာမျက်နှာ</h2>
              <p className="text-xs text-on-surface-variant font-label">{currentAlert?.location || 'Myanmar Live Feed'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2.5 rounded-full hover:bg-surface-container-high text-on-surface-variant transition-all active:scale-90">
              <span className="material-symbols-outlined">search</span>
            </button>
            <button className="p-2.5 rounded-full hover:bg-surface-container-high text-on-surface-variant relative transition-all active:scale-90">
              <span className="material-symbols-outlined">notifications</span>
              {alerts.length > 0 ? <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full"></span> : null}
            </button>
          </div>
        </div>
      </header>

      <main className="pt-28 px-6 pb-12 max-w-5xl mx-auto space-y-8">
        <section className="bg-primary text-on-primary rounded-3xl p-6 md:p-10 shadow-xl relative overflow-hidden">
          <div className="absolute right-0 bottom-0 opacity-10 translate-x-1/4 translate-y-1/4">
            <span className="material-symbols-outlined text-[120px]">{currentMeta.icon}</span>
          </div>

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-3xl">
              <p className="font-label text-on-primary/80 text-sm font-bold uppercase tracking-widest">ယနေ့ ရာသီဥတု အခြေအနေ</p>
              <h3 className="text-3xl md:text-4xl font-headline font-extrabold">{currentMeta.headline}</h3>
              <p className="font-label text-on-primary/90 text-base md:text-lg font-medium">{currentMeta.subline}</p>
              <p className="font-body opacity-90 text-lg">{currentMeta.summary}</p>
            </div>

            <div className="flex flex-col gap-3 min-w-[220px]">
              <div className="bg-white/15 backdrop-blur-md px-4 py-3 rounded-2xl">
                <div className="text-xs uppercase font-label text-on-primary/70 tracking-widest">System Status</div>
                <div className="mt-1 font-headline font-bold">{status}</div>
              </div>
              <div className="flex gap-3">
                <button className="bg-white/20 hover:bg-white/30 backdrop-blur-md px-5 py-3 rounded-full font-headline font-bold transition-all flex items-center gap-2 text-sm">
                  <span className="material-symbols-outlined text-lg">map</span>
                  မြေပုံကြည့်ရန်
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <a
              key={action.label}
              className="bg-surface-container-low p-4 rounded-2xl flex flex-col items-center justify-center gap-2 border border-outline/5 hover:bg-white transition-all group"
              href="#"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${action.iconClass}`}>
                <span className="material-symbols-outlined">{action.icon}</span>
              </div>
              <span className="font-headline font-bold text-sm text-center">{action.label}</span>
            </a>
          ))}
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
          <div className="bg-white rounded-3xl p-6 md:p-8 border border-outline/10 shadow-[0_12px_48px_rgba(27,29,14,0.06)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-primary-container text-primary flex items-center justify-center">
                <span className="material-symbols-outlined">travel_explore</span>
              </div>
              <div>
                <h3 className="font-headline text-2xl font-bold">Live Risk Detector</h3>
                <p className="text-sm text-on-surface-variant font-label">မြို့နယ်၊ ခရိုင် သို့မဟုတ် တိုင်းဒေသကြီးအလိုက် စစ်ဆေးပါ</p>
              </div>
            </div>

            <form className="space-y-5" onSubmit={runPrediction}>
              <label className="block">
                <span className="text-sm font-label font-bold text-on-surface-variant">မြန်မာတည်နေရာ</span>
                <input
                  type="text"
                  value={form.location}
                  onChange={(event) => updateField('location', event.target.value)}
                  placeholder="ဥပမာ - Hlegu, Yangon, Nay Pyi Taw"
                  className="mt-2 w-full rounded-2xl border-outline/10 bg-surface-container-low px-4 py-3.5 text-on-surface focus:border-primary focus:ring-primary"
                />
              </label>

              <label className="block">
                <span className="text-sm font-label font-bold text-on-surface-variant">သီးနှံအမျိုးအစား</span>
                <select
                  value={form.crop}
                  onChange={(event) => updateField('crop', event.target.value)}
                  className="mt-2 w-full rounded-2xl border-outline/10 bg-surface-container-low px-4 py-3.5 text-on-surface focus:border-primary focus:ring-primary"
                >
                  {cropOptions.map((crop) => (
                    <option key={crop} value={crop}>{crop}</option>
                  ))}
                </select>
              </label>

              <div>
                <div className="text-sm font-label font-bold text-on-surface-variant mb-2">အမြန်ရွေးချယ်ရန်</div>
                <div className="flex flex-wrap gap-2">
                  {quickLocations.map((location) => (
                    <button
                      key={location}
                      type="button"
                      onClick={() => updateField('location', location)}
                      className="px-3 py-2 rounded-full bg-surface-container-low text-on-surface-variant border border-outline/10 text-sm font-label font-bold hover:bg-primary hover:text-white transition-all"
                    >
                      {location}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-surface-container-low p-4 border border-outline/10">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary">info</span>
                  <p className="text-sm text-on-surface-variant font-body">
                    UI ကို Burmese-first style နဲ့ ပြန်တည်ဆောက်ထားပြီး အကောင့်ပိုင်းကိုလည်း live sync, လယ်ယာအရွယ်အစား, စိုက်ပျိုးသီးနှံ အချက်အလက်များပါဝင်အောင် ပြောင်းထားပါသည်။
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <button className="bg-primary text-on-primary px-8 py-3 rounded-full font-headline font-bold shadow-lg hover:shadow-xl transition-all active:scale-95">
                  Live Risk စစ်ဆေးရန်
                </button>
              </div>
            </form>
          </div>

          <div className="bg-surface-container-low rounded-3xl p-6 border border-outline/10 space-y-5">
            <div className="flex items-center gap-3">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${currentMeta.iconPanelClass}`}>
                <span className="material-symbols-outlined text-3xl">{currentMeta.icon}</span>
              </div>
              <div>
                <div className="text-sm text-on-surface-variant font-label">အဓိကစောင့်ကြည့်မှု</div>
                <div className="text-xl font-headline font-bold">{currentAlert?.location || 'Myanmar Live Feed'}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-4 border border-outline/10">
                <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Confidence</div>
                <div className="mt-1 text-3xl font-headline font-extrabold">{currentAlert ? `${currentAlert.confidence}%` : '--'}</div>
              </div>
              <div className="rounded-2xl bg-white p-4 border border-outline/10">
                <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Coordinates</div>
                <div className="mt-1 text-lg font-headline font-bold">{formatCoordinates(currentAlert?.weather)}</div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 border border-outline/10">
              <div className="text-sm font-headline font-bold mb-3">Live Weather Snapshot</div>
              <div className="grid grid-cols-2 gap-3">
                {weatherCards.length > 0 ? (
                  weatherCards.map((card) => (
                    <div key={card.label} className="rounded-2xl bg-surface-container-low p-3">
                      <div className="text-xs text-on-surface-variant font-label">{card.label}</div>
                      <div className="mt-1 text-lg font-headline font-bold">{card.value}</div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 text-sm text-on-surface-variant font-body">
                    Live weather data မရရှိသေးပါ။ Watchlist မှ alert တစ်ခုကို ရွေးပါ သို့မဟုတ် live lookup ပြုလုပ်ပါ။
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 border border-outline/10">
              <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Forecast Time</div>
              <div className="mt-2 font-headline font-bold">{formatForecastTime(currentAlert?.weather?.forecast_time)}</div>
              <div className="mt-1 text-sm text-on-surface-variant font-label">
                Source: {currentAlert?.source || 'Open-Meteo live forecast'}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-headline font-bold text-lg text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">bolt</span>
              လက်ရှိ သတိထားရန်
            </h3>
            <a className="text-primary font-headline font-bold text-sm hover:underline" href="#">
              အားလုံးကြည့်ရန်
            </a>
          </div>

          <article className="bg-white rounded-3xl p-6 md:p-8 flex flex-col md:flex-row gap-6 md:items-center shadow-[0_12px_48px_rgba(45,106,79,0.12)] border-2 border-primary/20 relative overflow-hidden">
            <div className={`absolute left-0 top-0 bottom-0 w-3 ${currentMeta.accentClass}`}></div>
            <div className={`w-24 h-24 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${currentMeta.iconPanelClass}`}>
              <span className="material-symbols-outlined text-6xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                {currentMeta.icon}
              </span>
            </div>

            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`px-4 py-1.5 rounded-full text-xs font-bold font-label uppercase tracking-wider ${currentMeta.badgeClassName}`}>
                    {currentMeta.badge}
                  </span>
                  <div className="flex items-center gap-1.5 text-primary font-bold font-headline">
                    <span className="material-symbols-outlined text-lg">location_on</span>
                    <span>{currentAlert?.location || 'Myanmar'}</span>
                  </div>
                </div>
                <time className="text-sm text-on-surface-variant font-label font-medium opacity-60">
                  {formatForecastTime(currentAlert?.weather?.forecast_time)}
                </time>
              </div>

              <h3 className="font-headline text-2xl md:text-3xl font-bold text-on-surface leading-tight">
                {currentAlert?.risk || 'Live alert not available yet'}
              </h3>
              <p className="text-on-surface-variant font-body leading-relaxed max-w-2xl text-lg">
                {currentAlert?.advice || 'Live Myanmar weather feed ကို စောင့်ဆိုင်းနေပါသည်။'}
              </p>
              <div className="pt-2 flex flex-wrap gap-3">
                <span className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium ${badgeClass(currentAlert?.risk || '')}`}>
                  {currentAlert?.crop || 'Rice'}
                </span>
                <span className="inline-flex items-center rounded-full border border-outline/10 bg-surface-container-low px-4 py-2 text-sm font-headline font-bold text-on-surface-variant">
                  {formatValue(currentAlert?.weather?.rainfall_mm_next_3_days, ' mm', 1)} rain
                </span>
              </div>
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-6">
          <div className="space-y-4">
            <h3 className="font-headline font-bold text-lg text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">history</span>
              လတ်တလော ထုတ်ပြန်ချက်များ
            </h3>

            <div className="grid grid-cols-1 gap-4">
              {recentAlerts.length > 0 ? (
                recentAlerts.map((alert) => (
                  <article
                    key={`${alert.location}-${alert.crop}-${alert.risk}`}
                    className="bg-surface-container-low rounded-2xl p-5 flex gap-5 items-center border border-outline/5 hover:bg-white transition-all group cursor-pointer"
                    onClick={() => {
                      setSelectedAlert(alert)
                      setGeneratedAlert(null)
                    }}
                  >
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center shrink-0 ${getRiskMeta(alert).iconPanelClass}`}>
                      <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {getRiskMeta(alert).icon}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold font-label px-2 py-0.5 rounded-full uppercase ${getRiskMeta(alert).badgeClassName}`}>
                          {getRiskMeta(alert).badge}
                        </span>
                        <span className="text-xs text-on-surface-variant font-label">{formatForecastTime(alert.weather?.forecast_time)}</span>
                      </div>
                      <h4 className="font-headline font-bold text-on-surface truncate group-hover:text-primary transition-colors">
                        {alert.location} • {alert.risk}
                      </h4>
                      <p className="text-xs text-on-surface-variant font-body truncate opacity-80">
                        {alert.advice}
                      </p>
                    </div>

                    <button className="w-10 h-10 rounded-full border border-outline/20 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all">
                      <span className="material-symbols-outlined text-lg">chevron_right</span>
                    </button>
                  </article>
                ))
              ) : (
                <div className="bg-surface-container-low rounded-2xl p-5 border border-outline/5 text-on-surface-variant">
                  Live alert feed မရရှိသေးပါ။
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <section className="bg-white rounded-3xl p-6 border border-outline/10 shadow-[0_12px_36px_rgba(27,29,14,0.06)]">
              <div className="flex items-center justify-between">
                <h3 className="font-headline font-bold text-lg">SMS Preview</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-container text-on-primary-container px-3 py-1 text-xs font-label font-bold">
                  <span className="material-symbols-outlined text-base">sms</span>
                  Ready
                </span>
              </div>
              <div className="mt-4 rounded-3xl bg-[#1b1d0e] text-white p-5 shadow-inner min-h-40">
                <div className="text-xs uppercase tracking-wide text-white/50">Farmer Alert</div>
                <p className="mt-3 text-sm leading-6 font-body">
                  {currentAlert?.sms || 'Live alert ကို ရွေးချယ်ပြီး SMS စာတိုအဖြစ် ကြည့်ရှုနိုင်ပါသည်။'}
                </p>
              </div>
            </section>

            <section className="bg-surface-container rounded-3xl p-6 border border-outline/10">
              <h3 className="font-headline font-bold text-lg flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">manage_accounts</span>
                အကောင့် & လယ်ယာ အချက်အလက်
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white p-4 border border-outline/10">
                  <div className="text-xs text-on-surface-variant font-label uppercase tracking-wide">Preferred Crop</div>
                  <div className="mt-1 font-headline font-bold">{form.crop}</div>
                </div>
                <div className="rounded-2xl bg-white p-4 border border-outline/10">
                  <div className="text-xs text-on-surface-variant font-label uppercase tracking-wide">Active Township</div>
                  <div className="mt-1 font-headline font-bold">{form.location || 'Hlegu'}</div>
                </div>
                <div className="rounded-2xl bg-white p-4 border border-outline/10">
                  <div className="text-xs text-on-surface-variant font-label uppercase tracking-wide">Source</div>
                  <div className="mt-1 font-headline font-bold">{currentAlert?.source || 'Live API'}</div>
                </div>
                <div className="rounded-2xl bg-white p-4 border border-outline/10">
                  <div className="text-xs text-on-surface-variant font-label uppercase tracking-wide">Account Mode</div>
                  <div className="mt-1 font-headline font-bold">{accountSyncLabel}</div>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-white p-4 border border-outline/10 text-sm text-on-surface-variant font-body">
                သင့်အကောင့်ကဏ္ဍကို sample profile card ထက် ပိုအသုံးဝင်အောင် ပြင်ထားပြီး live sync အခြေအနေ၊ စိုက်ပျိုးသီးနှံရွေးချယ်မှု၊ လယ်ယာအချက်အလက်နှင့် လတ်တလောစစ်ဆေးထားသော တည်နေရာကို တစ်နေရာတည်းတွင် ကြည့်နိုင်ပါသည်။
              </div>
            </section>
          </div>
        </section>
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 w-full flex justify-around items-center px-4 py-4 pb-8 bg-surface/90 backdrop-blur-xl border-t border-outline/10 shadow-[0_-8px_32px_rgba(27,29,14,0.1)] z-50">
        {[
          ['home', 'ပင်မ', true],
          ['notifications', 'သတိပေးချက်', false],
          ['map', 'မြေပုံ', false],
          ['manage_accounts', 'အကောင့်', false],
        ].map(([icon, label, active]) => (
          <a
            key={label}
            className={
              active
                ? 'flex flex-col items-center gap-1 text-primary bg-primary-container/30 px-6 py-2 rounded-2xl transition-all active:scale-90'
                : 'flex flex-col items-center gap-1 text-on-surface-variant opacity-60 transition-all active:scale-90'
            }
            href="#"
          >
            <span
              className="material-symbols-outlined"
              style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {icon}
            </span>
            <span className="font-headline text-[11px] font-bold">{label}</span>
          </a>
        ))}
      </nav>
    </>
  )
}
