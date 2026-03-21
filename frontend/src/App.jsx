import { useEffect, useMemo, useRef, useState } from 'react'

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')
).replace(/\/$/, '')

const cropOptions = ['Rice', 'Sesame', 'Pulses', 'Maize', 'Groundnut', 'Vegetables']
const views = [
  { id: 'home', icon: 'dashboard', label: 'ပင်မစာမျက်နှာ' },
  { id: 'alerts', icon: 'notifications', label: 'သတိပေးချက်များ' },
  { id: 'map', icon: 'map', label: 'မြေပုံ' },
  { id: 'guide', icon: 'menu_book', label: 'လမ်းညွှန်' },
]
const SYSTEM_NOTIFICATION_POLL_MS = 5 * 60 * 1000
const SYSTEM_NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000
const CUTE_GREETING_INTERVAL_MS = 5 * 60 * 1000
const ADMIN_BROADCAST_POLL_MS = 15000
const INSTALL_GATE_STORAGE_KEY = 'climate-monitor-install-gate-complete'
const ADMIN_VIEW_ID = 'admin-noti'
const ICON_VERSION = '20260321'
const AUTO_UPDATE_EVENT = 'climate-monitor:auto-update'
const TAB_TRANSITION_SWITCH_MS = 240
const TAB_TRANSITION_TOTAL_MS = 12000
const DEFAULT_NOTIFICATION_CHANNELS = {
  app: true,
  temperature: true,
}
const CUTE_GREETING_MESSAGES = [
  {
    title: 'သာယာသောနေ့လေးဖြစ်ပါစေ',
    body: 'Climate Monitor က ဒီနေ့ရဲ့ ရာသီဥတုအပြောင်းအလဲတွေကို ချိုချိုလေး စောင့်ကြည့်ပေးနေပါတယ်။',
  },
  {
    title: 'မင်္ဂလာပါ တောင်သူလေး',
    body: 'လက်ရှိအပူချိန်နဲ့ forecast update တွေကို app ထဲမှာ ပြင်ဆင်ထားပြီး စစ်ဆေးနိုင်ပါတယ်။',
  },
  {
    title: 'နေ့လယ်ခင်းလေးကို အေးအေးချမ်းချမ်းဖြတ်သန်းပါ',
    body: 'မြို့နယ်အလိုက် temperature feed နဲ့ climate watch ကို Climate Monitor က ဆက်လက်ပြပေးနေပါတယ်။',
  },
  {
    title: 'စိုက်ခင်းအတွက် ချစ်စရာသတိပေးချက်လေး',
    body: 'အပူချိန်ပြောင်းလဲမှုရှိလာရင် app က သတိပေးမယ်နော်။ လိုအပ်ရင် map view ကို ဝင်စစ်ပါ။',
  },
  {
    title: 'Climate Monitor က နှုတ်ဆက်ပါတယ်',
    body: 'မြန်မာတည်နေရာအလိုက် weather watch နဲ့ notification feed ကို အချိန်နဲ့တပြေးညီ ပြင်ဆင်ထားပါတယ်။',
  },
  {
    title: 'အလုပ်တွေ အဆင်ပြေပါစေ',
    body: 'ဒီ app ထဲက live risk detector, map နဲ့ notifications တွေကို အချိန်မရွေး ပြန်ဝင်စစ်နိုင်ပါတယ်။',
  },
]

const quickActions = [
  {
    icon: 'travel_explore',
    label: 'Live စစ်ဆေးရန်',
    iconClass: 'bg-primary-container text-primary',
    targetView: 'home',
  },
  {
    icon: 'notifications',
    label: 'သတိပေးချက်များ',
    iconClass: 'bg-secondary-container text-on-secondary-container',
    targetView: 'alerts',
  },
  {
    icon: 'map',
    label: 'မြေပုံကြည့်ရန်',
    iconClass: 'bg-tertiary/10 text-tertiary',
    targetView: 'map',
  },
  {
    icon: 'menu_book',
    label: 'လမ်းညွှန်',
    iconClass: 'bg-primary/10 text-primary',
    targetView: 'guide',
  },
]

const defaultForm = {
  location: '',
  crop: 'Rice',
}

const readErrorMessage = async (response, fallbackMessage) => {
  try {
    const payload = await response.json()
    return payload?.detail || fallbackMessage
  } catch {
    return fallbackMessage
  }
}

const getRiskKind = (risk = '') => {
  if (risk.includes('ရေကြီး')) return 'flood'
  if (risk.includes('မိုးခေါင်')) return 'drought'
  if (risk.includes('မိုးသက်') || risk.includes('လေပြင်း')) return 'storm'
  return 'moderate'
}

const badgeClass = (risk) => {
  const riskKind = getRiskKind(risk)
  if (riskKind === 'flood') return 'bg-red-100 text-red-700 border-red-200'
  if (riskKind === 'drought') return 'bg-orange-100 text-orange-700 border-orange-200'
  if (riskKind === 'storm') return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-blue-100 text-blue-700 border-blue-200'
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

const formatProducts = (products) => {
  if (!products?.length) return 'Crop profile unavailable'
  return products.join(' • ')
}

const formatLocationOptionSummary = (option) => {
  if (!option) return 'Location menu loading...'

  const parts = [option.district]
  if (option.district_group) {
    parts.push(option.district_group)
  }
  parts.push(option.region)
  return parts.join(', ')
}

const readGeolocationError = (error) => {
  if (!error) return 'လက်ရှိတည်နေရာကို မရရှိနိုင်ပါ။'

  switch (error.code) {
    case 1:
      return 'တည်နေရာအသုံးပြုခွင့်ကို browser ထဲတွင် ခွင့်ပြုပါ။'
    case 2:
      return 'လက်ရှိတည်နေရာကို ရှာမတွေ့ပါ။'
    case 3:
      return 'တည်နေရာရှာဖွေမှု အချိန်ကုန်သွားပါသည်။'
    default:
      return 'လက်ရှိတည်နေရာကို မရရှိနိုင်ပါ။'
  }
}

const getRiskMeta = (alert) => {
  if (!alert) {
    return {
      headline: 'စောင့်ကြည့်နေဆဲ',
      subline: 'ဒေတာချိတ်ဆက်မှုကို စစ်ဆေးနေပါသည်။',
      summary: 'မြန်မာနိုင်ငံအတွင်း ရာသီဥတုဒေတာများကို စုဆောင်းနေပါသည်။',
      icon: 'monitoring',
      badge: 'Live Feed',
      badgeClassName: 'bg-white/20 text-white',
      accentClass: 'bg-primary',
      iconPanelClass: 'bg-white/15 text-white',
    }
  }

  const riskKind = getRiskKind(alert.risk)

  if (riskKind === 'flood') {
    return {
      headline: 'ရေကြီးနိုင်မှု မြင့်မားနေပါသည်',
      subline: `${alert.location} အတွက် စိုက်ခင်းကာကွယ်ရေး လိုအပ်နေပါသည်`,
      summary: `${alert.crop} စိုက်ခင်းအတွက် ၃ ရက်အတွင်း မိုးရေ ${formatValue(alert.weather?.rainfall_mm_next_3_days, ' mm', 1)} ရနိုင်ပြီး ရေတင်ခြင်းကို ကြိုတင်ကာကွယ်ရန် လိုအပ်ပါသည်။`,
      icon: 'flood',
      badge: 'အထူးသတိပေးချက်',
      badgeClassName: 'bg-error text-on-error',
      accentClass: 'bg-error',
      iconPanelClass: 'bg-error-container text-error',
    }
  }

  if (riskKind === 'drought') {
    return {
      headline: 'အပူခြောက်သွေ့မှု သတိပေးချက်',
      subline: `${alert.location} တွင် ရေရှားပါးမှု မြင့်တက်နေပါသည်`,
      summary: `${alert.crop} အတွက် မိုးရေ ${formatValue(alert.weather?.rainfall_mm_next_3_days, ' mm', 1)} သာရှိပြီး အပူချိန် ${formatValue(alert.weather?.max_temperature_c_next_3_days, '°C', 1)} အထိ တက်နိုင်ပါသည်။`,
      icon: 'thermostat',
      badge: 'အထူးသတိပေးချက်',
      badgeClassName: 'bg-error text-on-error',
      accentClass: 'bg-error',
      iconPanelClass: 'bg-error-container text-error',
    }
  }

  if (riskKind === 'storm') {
    return {
      headline: 'မိုးသက်လေပြင်း သတိပေးချက်',
      subline: `${alert.location} တွင် လေပြင်းနှင့် မိုးသက်ရောက်နိုင်ပါသည်`,
      summary: `${alert.crop} စိုက်ခင်းအတွက် အများဆုံးလေတိုက်နှုန်း ${formatValue(alert.weather?.max_wind_kph_next_3_days, ' kph', 1)} အထိ ရောက်နိုင်ပြီး အပြင်လုပ်ငန်းများကို လျှော့ချရန် သင့်တော်ပါသည်။`,
      icon: 'thunderstorm',
      badge: 'သတိထားရန်',
      badgeClassName: 'bg-secondary-container text-on-secondary-container',
      accentClass: 'bg-secondary',
      iconPanelClass: 'bg-secondary-container text-on-secondary-container',
    }
  }

  return {
    headline: 'အန္တရာယ် နည်းပါးပါသည်',
    subline: `${alert.location} တွင် စောင့်ကြည့်ရမည့် အခြေအနေသာ ရှိပါသည်`,
    summary: `${alert.crop} စိုက်ခင်းအတွက် လက်ရှိဒေတာအရ အန္တရာယ် မမြင့်သေးပါ။ သို့သော် ရာသီဥတု ပြောင်းလဲမှုများကို ဆက်လက် စောင့်ကြည့်သင့်ပါသည်။`,
    icon: 'eco',
    badge: 'အန္တရာယ် နည်းပါး',
    badgeClassName: 'bg-primary-container text-on-primary-container',
    accentClass: 'bg-primary',
    iconPanelClass: 'bg-primary-container text-primary',
  }
}

const getGuideCards = (currentAlert) => [
  {
    icon: 'water_drop',
    title: 'ရေကြီးမှု ကာကွယ်ရေး',
    body: 'ရေလျှံနိုင်သည့်နေရာများတွင် ရေထွက်ပေါက်ဖွင့်ထားပြီး သီးနှံအာဟာရနှင့် စက်ကိရိယာများကို မြင့်သောနေရာသို့ ရွှေ့ပါ။',
  },
  {
    icon: 'thermostat',
    title: 'အပူခြောက်သွေ့မှု စီမံခန့်ခွဲရေး',
    body: 'ရေသွင်းစနစ် စစ်ဆေးထားပြီး mulch ဖြန့်ကာ မြေဆီလွှာမှ ရေစိမ့်ဆုံးရှုံးမှု လျှော့ချပါ။',
  },
  {
    icon: 'air',
    title: 'လေပြင်း မိုးသက်',
    body: 'အပြင် spray လုပ်ငန်းများကို ခဏရပ်နားပြီး ပျိုးပင်နှင့် စိုက်ခင်းထောက်တိုင်များကို တင်းကြပ်စွာ ချည်နှောင်ပါ။',
  },
  {
    icon: 'sms',
    title: 'SMS အချက်ပေး မျှဝေရန်',
    body: currentAlert?.sms || 'Live alert ရလာသောအခါ SMS message ကို တောင်သူအုပ်စုများသို့ လျင်မြန်စွာ မျှဝေနိုင်ပါသည်။',
  },
]

const getMapLinks = (alert) => {
  const latitude = alert?.weather?.latitude
  const longitude = alert?.weather?.longitude

  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    return null
  }

  const lat = Number(latitude)
  const lon = Number(longitude)
  const deltaLat = 0.18
  const deltaLon = 0.24
  const bbox = [
    (lon - deltaLon).toFixed(5),
    (lat - deltaLat).toFixed(5),
    (lon + deltaLon).toFixed(5),
    (lat + deltaLat).toFixed(5),
  ].join('%2C')

  return {
    embedUrl: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)}%2C${lon.toFixed(5)}`,
    externalUrl: `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lon.toFixed(5)}#map=9/${lat.toFixed(5)}/${lon.toFixed(5)}`,
  }
}

const pickMatchingAlert = (currentAlert, nextAlerts) => {
  if (!nextAlerts.length) return null
  if (!currentAlert) return nextAlerts[0]

  return nextAlerts.find(
    (alert) => alert.location === currentAlert.location && alert.crop === currentAlert.crop,
  ) || nextAlerts[0]
}

const groupLocationOptions = (options) => {
  const groupMap = new Map()

  options.forEach((option) => {
    const label = option.menu_group || option.region
    if (!groupMap.has(label)) {
      groupMap.set(label, [])
    }

    groupMap.get(label).push(option)
  })

  return Array.from(groupMap.entries()).map(([label, items]) => ({ label, items }))
}

const isStandaloneApp = () => {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

const getNotificationSupport = () => (
  typeof window !== 'undefined'
  && 'Notification' in window
  && 'serviceWorker' in navigator
)

const getHottestTemperatureCopy = (alert) => {
  const currentTemperature = formatValue(alert.weather?.current_temperature_c, '°C', 1)
  return {
    title: `${alert.location} သည် လက်ရှိအပူဆုံးနေရာဖြစ်ပါသည်`,
    body: `စောင့်ကြည့်နေသည့်နေရာများထဲတွင် ${currentTemperature} ဖြင့် အပူချိန်အမြင့်ဆုံးဖြစ်နေပါသည်။ ${alert.crop} စိုက်ခင်းအတွက် ရေသွင်းစနစ်နှင့် အပူကာကွယ်ရေးကို ပြင်ဆင်ပါ။`,
  }
}

const pickCuteGreetingMessage = (previousIndex) => {
  if (CUTE_GREETING_MESSAGES.length === 1) {
    return { ...CUTE_GREETING_MESSAGES[0], index: 0 }
  }

  let nextIndex = Math.floor(Math.random() * CUTE_GREETING_MESSAGES.length)
  while (nextIndex === previousIndex) {
    nextIndex = Math.floor(Math.random() * CUTE_GREETING_MESSAGES.length)
  }

  return {
    ...CUTE_GREETING_MESSAGES[nextIndex],
    index: nextIndex,
  }
}

const getRequestedViewFromLocation = () => {
  if (typeof window === 'undefined') return 'home'

  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const hashRoute = window.location.hash.replace(/^#/, '')

  if (pathname === '/noti' || pathname === '/noti.html' || hashRoute === '/noti') {
    return ADMIN_VIEW_ID
  }

  return 'home'
}

const getStoredNotificationChannels = () => {
  if (typeof window === 'undefined') return DEFAULT_NOTIFICATION_CHANNELS

  try {
    const rawValue = window.localStorage.getItem('climate-monitor-notification-channels')
    if (!rawValue) return DEFAULT_NOTIFICATION_CHANNELS

    const parsedValue = JSON.parse(rawValue)
    return {
      app: parsedValue.app !== false,
      temperature: parsedValue.temperature !== false,
    }
  } catch {
    return DEFAULT_NOTIFICATION_CHANNELS
  }
}

const getStoredInstallGateComplete = () => {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(INSTALL_GATE_STORAGE_KEY) === '1'
}

const isIosDevice = () => {
  if (typeof window === 'undefined') return false

  const userAgent = window.navigator.userAgent || ''
  const platform = window.navigator.platform || ''
  return /iphone|ipad|ipod/i.test(userAgent) || (platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
}

const isAndroidPhoneDevice = () => {
  if (typeof window === 'undefined') return false
  return /android.+mobile/i.test(window.navigator.userAgent || '')
}

const shouldUseInstallGate = () => isIosDevice() || isAndroidPhoneDevice()

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }

  return outputArray
}

export default function App() {
  const [alerts, setAlerts] = useState([])
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [selectedNotification, setSelectedNotification] = useState(null)
  const [locationOptions, setLocationOptions] = useState([])
  const [generatedAlert, setGeneratedAlert] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [status, setStatus] = useState('မြန်မာနိုင်ငံ ရာသီဥတုဒေတာများကို ချိတ်ဆက်နေပါသည်...')
  const [activeView, setActiveView] = useState(getRequestedViewFromLocation)
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const [notificationsError, setNotificationsError] = useState('')
  const [lastFeedRefresh, setLastFeedRefresh] = useState(null)
  const [currentBroadcast, setCurrentBroadcast] = useState(null)
  const [adminBroadcastForm, setAdminBroadcastForm] = useState({ title: '', body: '' })
  const [adminBroadcastStatus, setAdminBroadcastStatus] = useState('')
  const [adminBroadcastError, setAdminBroadcastError] = useState('')
  const [isSendingAdminBroadcast, setIsSendingAdminBroadcast] = useState(false)
  const [pushConfig, setPushConfig] = useState({ enabled: false, public_key: '', loaded: !API_BASE })
  const [notificationPermission, setNotificationPermission] = useState(
    getNotificationSupport() ? Notification.permission : 'unsupported',
  )
  const [notificationChannels, setNotificationChannels] = useState(getStoredNotificationChannels)
  const [isStandaloneMode, setIsStandaloneMode] = useState(isStandaloneApp)
  const [tabTransition, setTabTransition] = useState(null)
  const [isAutoUpdating, setIsAutoUpdating] = useState(false)
  const [installGateComplete, setInstallGateComplete] = useState(getStoredInstallGateComplete)
  const [installGateStatus, setInstallGateStatus] = useState('')
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null)
  const [notificationPromptDismissed, setNotificationPromptDismissed] = useState(false)
  const lastSystemNotificationAtRef = useRef(0)
  const lastGreetingIndexRef = useRef(-1)
  const deliveredBroadcastIdRef = useRef('')
  const tabTransitionTimeoutsRef = useRef([])

  const notificationsSupported = getNotificationSupport()

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
        const response = await fetch(`${API_BASE}/sample-alerts`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, 'မြန်မာ watchlist ကို မရရှိနိုင်ပါ။'))
        }

        const data = await response.json()
        const nextAlerts = data.alerts || []
        if (cancelled) return
        setAlerts(nextAlerts)
        setSelectedAlert((prev) => pickMatchingAlert(prev, nextAlerts))
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

  useEffect(() => {
    let cancelled = false

    const loadPushConfig = async () => {
      if (!API_BASE) return

      try {
        const response = await fetch(`${API_BASE}/push/config`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, 'Push config ကို မရရှိနိုင်ပါ။'))
        }

        const data = await response.json()
        if (cancelled) return
        setPushConfig({
          enabled: Boolean(data.enabled),
          public_key: data.public_key || '',
          loaded: true,
        })
      } catch {
        if (cancelled) return
        setPushConfig({ enabled: false, public_key: '', loaded: true })
      }
    }

    if (!API_BASE) {
      setPushConfig({ enabled: false, public_key: '', loaded: true })
    } else {
      void loadPushConfig()
    }

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const syncStandalone = () => {
      setIsStandaloneMode(isStandaloneApp())
    }

    syncStandalone()

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', syncStandalone)
      return () => {
        mediaQuery.removeEventListener('change', syncStandalone)
      }
    }

    mediaQuery.addListener(syncStandalone)
    return () => {
      mediaQuery.removeListener(syncStandalone)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setDeferredInstallPrompt(event)
      setInstallGateStatus('Install button ကို နှိပ်ပြီး web app ကို Home Screen သို့ ထည့်နိုင်ပါသည်။')
    }

    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null)
      setInstallGateStatus('Web app ကို ထည့်ပြီးပါပြီ။ Home Screen က app ကိုဖွင့်ပါ။')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    if (!isStandaloneMode || typeof window === 'undefined') return

    window.localStorage.setItem(INSTALL_GATE_STORAGE_KEY, '1')
    setInstallGateComplete(true)
    setInstallGateStatus('')
  }, [isStandaloneMode])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleStorage = (event) => {
      if (event.key !== INSTALL_GATE_STORAGE_KEY) return
      setInstallGateComplete(event.newValue === '1')
    }

    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    deliveredBroadcastIdRef.current = window.localStorage.getItem('climate-monitor-last-admin-broadcast-id') || ''

    const syncRequestedView = () => {
      const requestedView = getRequestedViewFromLocation()
      setActiveView((prev) => {
        if (requestedView === ADMIN_VIEW_ID) return ADMIN_VIEW_ID
        return prev === ADMIN_VIEW_ID ? 'home' : prev
      })
    }

    syncRequestedView()
    window.addEventListener('hashchange', syncRequestedView)
    window.addEventListener('popstate', syncRequestedView)

    return () => {
      window.removeEventListener('hashchange', syncRequestedView)
      window.removeEventListener('popstate', syncRequestedView)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleAutoUpdate = (event) => {
      if (!event.detail?.updating) return
      setIsAutoUpdating(true)
    }

    window.addEventListener(AUTO_UPDATE_EVENT, handleAutoUpdate)
    return () => {
      window.removeEventListener(AUTO_UPDATE_EVENT, handleAutoUpdate)
    }
  }, [])

  useEffect(() => () => {
    tabTransitionTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    tabTransitionTimeoutsRef.current = []
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadLocations = async () => {
      if (!API_BASE) return

      try {
        const response = await fetch(`${API_BASE}/locations`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, 'Location menu ကို မရရှိနိုင်ပါ။'))
        }

        const nextOptions = await response.json()
        if (cancelled) return
        setLocationOptions(nextOptions)
        setForm((prev) => {
          const hasExistingOption = nextOptions.some((option) => option.query === prev.location)
          if (hasExistingOption) return prev

          return {
            ...prev,
            location: nextOptions[0]?.query || prev.location,
          }
        })
      } catch {
        if (cancelled) return
        setLocationOptions([])
      }
    }

    loadLocations()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (activeView !== 'alerts' || !API_BASE) return

    let cancelled = false
    let inFlight = false

    const pollNotifications = async () => {
      if (inFlight || cancelled) return
      inFlight = true

      try {
        const response = await fetch(`${API_BASE}/live-notifications`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, 'Real-time notifications ကို မရရှိနိုင်ပါ။'))
        }

        const data = await response.json()
        const nextAlerts = data.alerts || []
        if (cancelled) return
        setNotifications(nextAlerts)
        setSelectedNotification((prev) => pickMatchingAlert(prev, nextAlerts))
        setNotificationsError('')
        setLastFeedRefresh(new Date().toISOString())
      } catch (error) {
        if (cancelled) return
        setNotificationsError(error.message || 'Real-time notifications ကို မရရှိနိုင်ပါ။')
      } finally {
        inFlight = false
      }
    }

    void pollNotifications()
    const intervalId = window.setInterval(() => {
      void pollNotifications()
    }, 2000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [activeView])

  useEffect(() => {
    if (!notificationsSupported || notificationPermission !== 'granted' || !notificationChannels.temperature) return undefined
    if (!pushConfig.loaded) return undefined
    if (pushConfig.enabled) return undefined
    if (!API_BASE) return undefined

    let cancelled = false
    let inFlight = false

    const pollSystemNotifications = async () => {
      if (cancelled || inFlight) return
      inFlight = true

      try {
        const response = await fetch(`${API_BASE}/live-notifications`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, 'အပူချိန် notification feed ကို မရရှိနိုင်ပါ။'))
        }

        const data = await response.json()
        const nextAlerts = data.alerts || []
        const hottestAlert = [...nextAlerts].sort(
          (left, right) => (right.weather?.current_temperature_c || 0) - (left.weather?.current_temperature_c || 0),
        )[0]

        const now = Date.now()
        if (!hottestAlert || now - lastSystemNotificationAtRef.current < SYSTEM_NOTIFICATION_COOLDOWN_MS) {
          return
        }

        const copy = getHottestTemperatureCopy(hottestAlert)
        const delivered = await showSystemNotification(copy.title, copy.body, {
          tag: `hottest-temperature-${hottestAlert.location}`,
          data: {
            path: '/#',
            view: 'alerts',
            location: hottestAlert.location,
          },
        })

        if (delivered) {
          lastSystemNotificationAtRef.current = now
        }
      } catch {
        return
      } finally {
        inFlight = false
      }
    }

    void pollSystemNotifications()
    const intervalId = window.setInterval(() => {
      void pollSystemNotifications()
    }, SYSTEM_NOTIFICATION_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [notificationChannels.temperature, notificationPermission, notificationsSupported, pushConfig.enabled, pushConfig.loaded])

  useEffect(() => {
    if (!notificationChannels.app) return
    if (notificationPermission !== 'granted') return
    if (!isStandaloneMode) return
    if (typeof window === 'undefined') return
    if (!pushConfig.loaded) return
    if (pushConfig.enabled) return

    const sessionKey = 'climate-monitor-standalone-welcome'
    if (window.sessionStorage.getItem(sessionKey)) return

    window.sessionStorage.setItem(sessionKey, '1')
    void showSystemNotification(
      'Climate Monitor မှ ကြိုဆိုပါသည်',
      'ဒီ app က မြန်မာတောင်သူအတွက် အပူချိန်ပြောင်းလဲမှုကို ချိုသာလေး သတိပေးပေးနေမယ်နော်။',
      {
        tag: 'welcome-climate-monitor',
        data: {
          path: '/#',
          view: 'home',
        },
      },
    )
  }, [isStandaloneMode, notificationChannels.app, notificationPermission, pushConfig.enabled, pushConfig.loaded])

  useEffect(() => {
    if (!notificationsSupported || notificationPermission !== 'granted' || !notificationChannels.app) return undefined
    if (!pushConfig.loaded) return undefined
    if (pushConfig.enabled) return undefined

    let cancelled = false

    const sendCuteGreeting = async () => {
      if (cancelled) return

      const nextGreeting = pickCuteGreetingMessage(lastGreetingIndexRef.current)
      lastGreetingIndexRef.current = nextGreeting.index

      await showSystemNotification(nextGreeting.title, nextGreeting.body, {
        tag: 'cute-greeting',
        renotify: true,
        data: {
          path: '/#',
          view: 'home',
        },
      })
    }

    const intervalId = window.setInterval(() => {
      void sendCuteGreeting()
    }, CUTE_GREETING_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [notificationChannels.app, notificationPermission, notificationsSupported, pushConfig.enabled, pushConfig.loaded])

  useEffect(() => {
    if (notificationPermission !== 'granted') return
    if (!pushConfig.enabled || !pushConfig.public_key) return

    void syncPushSubscription(notificationChannels)
  }, [
    notificationChannels.app,
    notificationChannels.temperature,
    notificationPermission,
    pushConfig.enabled,
    pushConfig.public_key,
  ])

  useEffect(() => {
    if (!API_BASE) return undefined

    const shouldPollAdminBroadcast = activeView === ADMIN_VIEW_ID || (
      pushConfig.loaded
      && !pushConfig.enabled
      && notificationsSupported
      && notificationPermission === 'granted'
      && notificationChannels.app
    )
    if (!shouldPollAdminBroadcast) return undefined

    let cancelled = false
    let inFlight = false

    const pollAdminBroadcast = async () => {
      if (cancelled || inFlight) return
      inFlight = true

      try {
        const response = await fetch(`${API_BASE}/admin-broadcast/current`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, 'Admin broadcast feed ကို မရရှိနိုင်ပါ။'))
        }

        const data = await response.json()
        const nextBroadcast = data.broadcast || null
        if (cancelled) return

        setCurrentBroadcast(nextBroadcast)
        setAdminBroadcastError('')

        if (
          activeView === ADMIN_VIEW_ID
          || notificationPermission !== 'granted'
          || !notificationChannels.app
          || !nextBroadcast?.id
          || nextBroadcast.id === deliveredBroadcastIdRef.current
        ) {
          return
        }

        const delivered = await showSystemNotification(nextBroadcast.title, nextBroadcast.body, {
          tag: nextBroadcast.id,
          renotify: true,
          requireInteraction: true,
          data: {
            path: '/#',
            view: 'home',
          },
        })

        if (delivered && typeof window !== 'undefined') {
          deliveredBroadcastIdRef.current = nextBroadcast.id
          window.localStorage.setItem('climate-monitor-last-admin-broadcast-id', nextBroadcast.id)
        }
      } catch (error) {
        if (cancelled) return

        if (activeView === ADMIN_VIEW_ID) {
          setAdminBroadcastError(error.message || 'Admin broadcast feed ကို မရရှိနိုင်ပါ။')
        }
      } finally {
        inFlight = false
      }
    }

    void pollAdminBroadcast()
    const intervalId = window.setInterval(() => {
      void pollAdminBroadcast()
    }, ADMIN_BROADCAST_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [API_BASE, activeView, notificationChannels.app, notificationPermission, notificationsSupported, pushConfig.enabled, pushConfig.loaded])

  const currentAlert = useMemo(() => generatedAlert || selectedAlert, [generatedAlert, selectedAlert])
  const currentMeta = useMemo(() => getRiskMeta(currentAlert), [currentAlert])
  const guideCards = useMemo(() => getGuideCards(currentAlert), [currentAlert])
  const mapLinks = useMemo(() => getMapLinks(currentAlert), [currentAlert])

  const recentAlerts = useMemo(() => {
    const currentKey = currentAlert ? `${currentAlert.location}-${currentAlert.crop}-${currentAlert.risk}` : null
    return alerts
      .filter((alert) => `${alert.location}-${alert.crop}-${alert.risk}` !== currentKey)
      .slice(0, 4)
  }, [alerts, currentAlert])

  const temperatureNotifications = useMemo(
    () => [...notifications].sort(
      (left, right) => (right.weather?.current_temperature_c || 0) - (left.weather?.current_temperature_c || 0),
    ),
    [notifications],
  )
  const activeNotification = useMemo(
    () => pickMatchingAlert(selectedNotification, temperatureNotifications),
    [selectedNotification, temperatureNotifications],
  )
  const hottestNotification = temperatureNotifications[0] || null
  const coolestNotification = temperatureNotifications[temperatureNotifications.length - 1] || null

  const weatherCards = currentAlert?.weather
    ? [
        { label: 'လက်ရှိ အပူချိန်', value: formatValue(currentAlert.weather.current_temperature_c, '°C', 1) },
        { label: 'လက်ရှိ စိုထိုင်းဆ', value: formatValue(currentAlert.weather.current_humidity_pct, '%') },
        { label: '၃ ရက်အတွင်း မိုးရေ', value: formatValue(currentAlert.weather.rainfall_mm_next_3_days, ' mm', 1) },
        { label: 'အများဆုံး အပူချိန်', value: formatValue(currentAlert.weather.max_temperature_c_next_3_days, '°C', 1) },
        { label: 'အများဆုံး လေတိုက်နှုန်း', value: formatValue(currentAlert.weather.max_wind_kph_next_3_days, ' kph', 1) },
        { label: 'မြေစိုထိုင်းဆ ပျမ်းမျှ', value: formatValue(currentAlert.weather.avg_soil_moisture_pct, '%', 1) },
      ]
    : []

  const activeViewMeta = useMemo(
    () => views.find((view) => view.id === activeView) || views[0],
    [activeView],
  )
  const groupedLocationOptions = useMemo(() => groupLocationOptions(locationOptions), [locationOptions])
  const selectedLocationOption = useMemo(
    () => locationOptions.find((option) => option.query === form.location) || null,
    [locationOptions, form.location],
  )
  const usesIosInstallFlow = isIosDevice()
  const installGateTargetDevice = shouldUseInstallGate()
  const installGateActive = installGateTargetDevice && !installGateComplete && !isStandaloneMode
  const installGateCanPrompt = Boolean(deferredInstallPrompt)
  const currentLocationLabel = currentAlert?.location || form.location || 'Myanmar Live Feed'
  const currentTemperatureLabel = formatValue(currentAlert?.weather?.current_temperature_c, '°C', 1)
  const notificationStatusLabel = notificationPermission === 'granted'
    ? !pushConfig.loaded
      ? 'Checking background push configuration...'
      : pushConfig.enabled
      ? 'Background push notifications are ready'
      : 'System notifications are ready, but background push is not configured'
    : notificationPermission === 'denied'
      ? 'Notifications are blocked in this browser'
      : notificationPermission === 'default'
        ? 'Allow notifications to watch app and temperature updates'
        : 'System notifications are not supported here'
  const appNotificationStatusLabel = notificationChannels.app
    ? 'App greetings and announcements are on'
    : 'App greetings and announcements are off'
  const temperatureNotificationStatusLabel = notificationChannels.temperature
    ? 'Temperature alerts are on'
    : 'Temperature alerts are off'

  const showSystemNotification = async (title, body, options = {}) => {
    if (!notificationsSupported || Notification.permission !== 'granted') return false

    const assetBase = import.meta.env.BASE_URL || '/'
    const notificationOptions = {
      body,
      icon: `${assetBase}icon-192.png?v=${ICON_VERSION}`,
      badge: `${assetBase}icon-192.png?v=${ICON_VERSION}`,
      image: `${assetBase}icon-512.png?v=${ICON_VERSION}`,
      lang: 'my',
      tag: options.tag,
      data: options.data,
      renotify: Boolean(options.renotify),
      requireInteraction: Boolean(options.requireInteraction),
    }

    try {
      const registration = await navigator.serviceWorker.ready
      if (registration?.showNotification) {
        await registration.showNotification(title, notificationOptions)
        return true
      }
    } catch {
      // Fall back to the page-level Notification API if the worker is not ready yet.
    }

    try {
      new Notification(title, notificationOptions)
      return true
    } catch {
      return false
    }
  }

  const syncPushSubscription = async (channelsToPersist = notificationChannels) => {
    if (!API_BASE || !pushConfig.enabled || !pushConfig.public_key) return false
    if (!notificationsSupported || Notification.permission !== 'granted') return false

    try {
      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(pushConfig.public_key),
        })
      }

      const response = await fetch(`${API_BASE}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          channels: channelsToPersist,
          user_agent: navigator.userAgent,
        }),
      })

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Background push subscription ကို မသိမ်းနိုင်ပါ။'))
      }

      return true
    } catch (error) {
      setStatus(error.message || 'Background push subscription ကို မသိမ်းနိုင်ပါ။')
      return false
    }
  }

  const persistNotificationChannels = (nextChannels) => {
    setNotificationChannels(nextChannels)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('climate-monitor-notification-channels', JSON.stringify(nextChannels))
    }
  }

  const requestSystemNotificationPermission = async () => {
    if (!notificationsSupported) {
      setStatus('ဒီ device မှာ system notification ကို မထောက်ပံ့ပါ။')
      return false
    }

    try {
      const nextPermission = await Notification.requestPermission()
      setNotificationPermission(nextPermission)

      if (nextPermission === 'granted') {
        setNotificationPromptDismissed(false)
        return true
      }

      if (nextPermission === 'denied') {
        setStatus('Notification ကို browser settings ထဲမှာ ပိတ်ထားပါသည်။ Allow ပြန်ဖွင့်ပေးပါ။')
        return false
      }

      setStatus('Notification ခွင့်ပြုချက်ကို မပေးရသေးပါ။')
      return false
    } catch {
      setStatus('Notification permission ကို မတောင်းခံနိုင်ပါ။')
      return false
    }
  }

  const toggleNotificationChannel = async (channel) => {
    const nextEnabled = !notificationChannels[channel]

    if (nextEnabled && notificationPermission !== 'granted') {
      const granted = await requestSystemNotificationPermission()
      if (!granted) return
    }

    const nextChannels = {
      ...notificationChannels,
      [channel]: nextEnabled,
    }
    persistNotificationChannels(nextChannels)

    if (nextEnabled && pushConfig.enabled) {
      await syncPushSubscription(nextChannels)
    }

    if (nextEnabled) {
      const statusMessage = channel === 'app'
        ? 'App notification channel ကို ဖွင့်ပြီးပါပြီ။'
        : 'Temperature alert channel ကို ဖွင့်ပြီးပါပြီ။'
      setStatus(statusMessage)

      await showSystemNotification(
        channel === 'app' ? 'App Notifications ဖွင့်ပြီးပါပြီ' : 'Temperature Alerts ဖွင့်ပြီးပါပြီ',
        channel === 'app'
          ? 'Cute greeting နဲ့ app announcement notifications တွေကို လက်ခံရရှိပါမည်။'
          : 'အပူချိန်အပြောင်းအလဲ alerts တွေကို သီးသန့် လက်ခံရရှိပါမည်။',
        {
          tag: channel === 'app' ? 'app-channel-enabled' : 'temperature-channel-enabled',
          data: {
            path: '/#',
            view: channel === 'app' ? 'home' : 'alerts',
          },
        },
      )
      return
    }

    setStatus(channel === 'app'
      ? 'App notification channel ကို ပိတ်လိုက်ပါပြီ။'
      : 'Temperature alert channel ကို ပိတ်လိုက်ပါပြီ။')
  }

  const enableNotificationCenter = async () => {
    const granted = await requestSystemNotificationPermission()
    if (!granted) return

    if (pushConfig.enabled) {
      await syncPushSubscription(notificationChannels)
    }

    setStatus('App notifications နဲ့ temperature alerts ကို သီးခြားထိန်းချုပ်နိုင်ပါပြီ။')
    await showSystemNotification(
      'Notification Center ဖွင့်ပြီးပါပြီ',
      'App notifications နဲ့ temperature alerts ကို သီးခြားဖွင့်ပိတ်နိုင်ပါပြီ။',
      {
        tag: 'notification-center-enabled',
        data: {
          path: '/#',
          view: 'home',
        },
      },
    )
  }

  const updateAdminBroadcastField = (key, value) => {
    setAdminBroadcastForm((prev) => ({ ...prev, [key]: value }))
  }

  const sendAdminBroadcast = async (event) => {
    event.preventDefault()

    const title = adminBroadcastForm.title.trim()
    const body = adminBroadcastForm.body.trim()

    if (!title || !body) {
      setAdminBroadcastError('Header and message body are required.')
      return
    }

    if (!API_BASE) {
      setAdminBroadcastError('Live backend URL မသတ်မှတ်ရသေးပါ။')
      return
    }

    setIsSendingAdminBroadcast(true)
    setAdminBroadcastError('')
    setAdminBroadcastStatus('Sending admin notification to active users...')

    try {
      const response = await fetch(`${API_BASE}/admin-broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
        }),
      })

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Admin notification ကို မပို့နိုင်ပါ။'))
      }

      const nextBroadcast = await response.json()
      setCurrentBroadcast(nextBroadcast)
      setAdminBroadcastStatus(`"${nextBroadcast.title}" notification ကို active users အတွက် ပို့ပြီးပါပြီ။`)

      if (typeof window !== 'undefined') {
        deliveredBroadcastIdRef.current = nextBroadcast.id
        window.localStorage.setItem('climate-monitor-last-admin-broadcast-id', nextBroadcast.id)
      }

      setAdminBroadcastForm((prev) => ({
        ...prev,
        title: '',
        body: '',
      }))
    } catch (error) {
      setAdminBroadcastError(error.message || 'Admin notification ကို မပို့နိုင်ပါ။')
      setAdminBroadcastStatus('')
    } finally {
      setIsSendingAdminBroadcast(false)
    }
  }

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const navigateToView = (nextView, options = {}) => {
    const { skipTransition = false } = options
    if (!nextView) return

    tabTransitionTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    tabTransitionTimeoutsRef.current = []

    if (skipTransition || nextView === ADMIN_VIEW_ID) {
      setTabTransition(null)
      setActiveView(nextView)
      return
    }

    if (nextView === activeView) {
      return
    }

    const nextViewMeta = views.find((view) => view.id === nextView)
    setTabTransition({
      viewId: nextView,
      label: nextViewMeta?.label || 'စာမျက်နှာအသစ်',
    })

    const switchTimeoutId = window.setTimeout(() => {
      setActiveView(nextView)
    }, TAB_TRANSITION_SWITCH_MS)
    const clearTimeoutId = window.setTimeout(() => {
      setTabTransition(null)
    }, TAB_TRANSITION_TOTAL_MS)

    tabTransitionTimeoutsRef.current = [switchTimeoutId, clearTimeoutId]
  }

  const focusAlert = (alert, nextView = activeView) => {
    setSelectedAlert(alert)
    setGeneratedAlert(null)
    setForm((prev) => ({ ...prev, crop: alert.crop }))
    navigateToView(nextView)
  }

  const requestPrediction = async (payload, nextView) => {
    if (!API_BASE) {
      setGeneratedAlert(null)
      setIsSubmitting(false)
      setIsLocating(false)
      setStatus('Live backend URL မသတ်မှတ်ရသေးပါ။')
      return
    }

    const requestedLocation = payload.latitude !== undefined && payload.longitude !== undefined
      ? 'သင့်လက်ရှိတည်နေရာ'
      : payload.location

    setIsSubmitting(true)
    setStatus(`${requestedLocation} အတွက် live forecast ကို စစ်ဆေးနေပါသည်...`)

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
      setSelectedAlert(data)
      setForm((prev) => ({
        ...prev,
        crop: data.crop,
        location: payload.latitude !== undefined && payload.longitude !== undefined
          ? prev.location
          : payload.location,
      }))
      navigateToView(nextView)
      setStatus(`${data.location} အတွက် live forecast ကို ရရှိပါပြီ။`)
    } catch (error) {
      setGeneratedAlert(null)
      setStatus(error.message || 'Live weather lookup failed.')
    } finally {
      setIsSubmitting(false)
      setIsLocating(false)
    }
  }

  const runTypedLookup = async (nextView) => {
    const payload = {
      location: form.location.trim(),
      crop: form.crop,
    }

    if (!payload.location) {
      setStatus('မြန်မာနိုင်ငံအတွင်း တည်နေရာတစ်ခုကို ထည့်သွင်းပါ။')
      return
    }

    await requestPrediction(payload, nextView)
  }

  const runPrediction = async (event) => {
    event.preventDefault()
    await runTypedLookup('home')
  }

  const runQuickSearch = async (nextView) => {
    await runTypedLookup(nextView)
    setIsQuickSearchOpen(false)
  }

  const runMapLookup = async (event) => {
    event.preventDefault()
    await runTypedLookup('map')
  }

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setStatus('ဒီ browser မှာ location service ကို မထောက်ပံ့ပါ။')
      return
    }

    if (!API_BASE) {
      setStatus('Live backend URL မသတ်မှတ်ရသေးပါ။')
      return
    }

    setIsLocating(true)
    setStatus('သင့်လက်ရှိတည်နေရာကို ရှာနေပါသည်...')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const payload = {
          location: 'လက်ရှိတည်နေရာ',
          crop: form.crop,
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        }

        void requestPrediction(payload, 'map')
      },
      (error) => {
        setIsLocating(false)
        setStatus(readGeolocationError(error))
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 300000,
      },
    )
  }

  const refreshInstallGateStatus = () => {
    if (isStandaloneApp()) {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(INSTALL_GATE_STORAGE_KEY, '1')
      }
      setInstallGateComplete(true)
      setInstallGateStatus('')
      return
    }

    setInstallGateStatus('Browser က installed app ကိုတိုက်ရိုက်မဖွင့်နိုင်ပါ။ Home Screen ပေါ်က Climate Monitor icon ကိုနှိပ်ပြီး app mode ဖြင့်ဖွင့်ပါ။')
  }

  const triggerInstallPrompt = async () => {
    if (!deferredInstallPrompt) {
      setInstallGateStatus('ဒီ browser မှာ install prompt မပြသနိုင်သေးပါ။ Chrome သို့မဟုတ် Edge ကိုသုံးပြီး ထည့်သွင်းပါ။')
      return
    }

    try {
      await deferredInstallPrompt.prompt()
      const choice = await deferredInstallPrompt.userChoice
      setDeferredInstallPrompt(null)

      if (choice?.outcome === 'accepted') {
        setInstallGateStatus('Install ကိုလက်ခံပြီးပါပြီ။ Browser က app ကိုတိုက်ရိုက်မဖွင့်နိုင်သဖြင့် Home Screen ပေါ်က Climate Monitor icon ကိုနှိပ်ပြီးဖွင့်ပါ။')
        return
      }

      setInstallGateStatus('Install ကိုမပြီးသေးပါ။ App ကိုသုံးရန် Home Screen install လုပ်ရန် လိုအပ်ပါသည်။')
    } catch {
      setInstallGateStatus('Install prompt ကိုဖွင့်မရပါ။ နောက်တစ်ကြိမ် ထပ်ကြိုးစားပါ။')
    }
  }

  const renderHomeView = () => (
    <div className="space-y-8">
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
              <button
                className="bg-white/20 hover:bg-white/30 backdrop-blur-md px-5 py-3 rounded-full font-headline font-bold transition-all flex items-center gap-2 text-sm"
                onClick={() => navigateToView('map')}
                type="button"
              >
                <span className="material-symbols-outlined text-lg">map</span>
                မြေပုံကြည့်ရန်
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {quickActions.map((action) => (
          <button
            key={action.label}
            className="bg-surface-container-low p-4 rounded-2xl flex flex-col items-center justify-center gap-2 border border-outline/5 hover:bg-white transition-all group"
            onClick={() => navigateToView(action.targetView)}
            type="button"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${action.iconClass}`}>
              <span className="material-symbols-outlined">{action.icon}</span>
            </div>
            <span className="font-headline font-bold text-sm text-center">{action.label}</span>
          </button>
        ))}
      </section>

      {notificationsSupported && notificationPermission !== 'granted' && !notificationPromptDismissed ? (
        <section className="bg-white rounded-3xl p-5 md:p-6 border border-outline/10 shadow-[0_12px_48px_rgba(27,29,14,0.06)]">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary-container text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-3xl">notifications_active</span>
              </div>
              <div>
                <div className="text-xs uppercase font-label text-primary tracking-widest">Notification Center</div>
                <h3 className="mt-1 text-2xl font-headline font-bold">App noti နဲ့ Temperature alert ကို သီးခြားသုံးနိုင်ပါမယ်</h3>
                <p className="mt-2 text-on-surface-variant font-body">
                  System notification permission ကို Allow လုပ်လိုက်ရင် app greetings, admin messages, နဲ့ temperature change alerts တို့ကို သီးခြားဖွင့်ပိတ်နိုင်ပါမည်။
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                className="rounded-full bg-primary px-6 py-3 text-sm font-headline font-bold text-on-primary shadow-lg hover:shadow-xl transition-all"
                onClick={() => {
                  void enableNotificationCenter()
                }}
                type="button"
              >
                System notifications ကို Allow လုပ်ရန်
              </button>
              <button
                className="rounded-full border border-outline/10 bg-white px-6 py-3 text-sm font-headline font-bold text-primary hover:bg-primary hover:text-white transition-all"
                onClick={() => setNotificationPromptDismissed(true)}
                type="button"
              >
                နောက်မှလုပ်မယ်
              </button>
            </div>
          </div>
        </section>
      ) : null}

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
              <select
                value={form.location}
                onChange={(event) => updateField('location', event.target.value)}
                className="mt-2 w-full rounded-2xl border-outline/10 bg-surface-container-low px-4 py-3.5 text-on-surface focus:border-primary focus:ring-primary"
                disabled={locationOptions.length === 0}
              >
                {locationOptions.length === 0 ? (
                  <option value="">Location menu loading...</option>
                ) : null}
                {groupedLocationOptions.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.items.map((option) => (
                      <option key={`${option.region}-${option.district}`} value={option.query}>
                        {option.district}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
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

            <div className="rounded-2xl bg-surface-container-low p-4 border border-outline/10">
              <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Selected Menu</div>
              <div className="mt-2 font-headline font-bold">
                {formatLocationOptionSummary(selectedLocationOption)}
              </div>
              <div className="mt-2 text-sm text-on-surface-variant font-body">
                {selectedLocationOption ? formatProducts(selectedLocationOption.products) : 'Menu data မရရှိသေးပါ။'}
              </div>
            </div>

            <div className="rounded-2xl bg-surface-container-low p-4 border border-outline/10">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary">info</span>
                <p className="text-sm text-on-surface-variant font-body">
                  ရွေးချယ်ထားသော တည်နေရာကို မြေပုံပေါ်တွင် mark လုပ်ပေးပြီး လက်ရှိအပူချိန်ကို မြေပုံဘေး panel တွင် တိုက်ရိုက်ပြသပါမည်။
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <button
                className="rounded-full border border-outline/10 bg-white px-5 py-3 text-sm font-headline font-bold text-primary hover:bg-primary hover:text-white transition-all disabled:opacity-60"
                disabled={isSubmitting || isLocating}
                onClick={useCurrentLocation}
                type="button"
              >
                {isLocating ? 'တည်နေရာ ရှာနေပါသည်...' : 'My location ကို သုံးရန်'}
              </button>
              <button
                className="bg-primary text-on-primary px-8 py-3 rounded-full font-headline font-bold shadow-lg hover:shadow-xl transition-all active:scale-95 disabled:opacity-60"
                disabled={isSubmitting || isLocating}
              >
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
                  Live weather data မရရှိသေးပါ။
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

          <div className="rounded-2xl bg-white p-4 border border-outline/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Notification Watch</div>
                <div className="mt-2 font-headline font-bold">{notificationStatusLabel}</div>
                <div className="mt-1 text-sm text-on-surface-variant font-body">
                  {isStandaloneMode
                    ? 'Home Screen app mode ဖြင့် ဖွင့်ထားပြီးပါပြီ။ Cute greeting notification ကို ၅ မိနစ်တစ်ကြိမ် ရနိုင်ပါသည်။'
                    : 'Home Screen app mode မဟုတ်သေးပါ။ Install လုပ်ထားရင် welcome notification နဲ့ ၅ မိနစ်တစ်ကြိမ် greeting notice ကို ပိုကောင်းစွာ ပြသနိုင်ပါသည်။'}
                </div>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-headline font-bold ${
                notificationPermission === 'granted'
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface-container-low text-on-surface-variant'
              }`}>
                {notificationPermission === 'granted' ? 'On' : 'Off'}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface-container-low p-4 border border-outline/10">
                <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">App Notifications</div>
                <div className="mt-2 font-headline font-bold">{appNotificationStatusLabel}</div>
                <div className="mt-2 text-sm text-on-surface-variant font-body">
                  Cute greeting, welcome notice, နဲ့ app announcement များအတွက် သီးသန့် channel ဖြစ်ပါသည်။
                </div>
                <button
                  className={`mt-4 rounded-full px-5 py-3 text-sm font-headline font-bold transition-all ${
                    notificationChannels.app
                      ? 'border border-outline/10 bg-white text-primary hover:bg-primary hover:text-white'
                      : 'bg-primary text-on-primary shadow-lg hover:shadow-xl'
                  }`}
                  onClick={() => {
                    void toggleNotificationChannel('app')
                  }}
                  type="button"
                >
                  {notificationChannels.app ? 'App noti ကို ပိတ်ရန်' : 'App noti ကို ဖွင့်ရန်'}
                </button>
              </div>

              <div className="rounded-2xl bg-surface-container-low p-4 border border-outline/10">
                <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Temperature Alerts</div>
                <div className="mt-2 font-headline font-bold">{temperatureNotificationStatusLabel}</div>
                <div className="mt-2 text-sm text-on-surface-variant font-body">
                  Location အလိုက် အပူချိန်ပြောင်းလဲမှုကို app notifications နဲ့ မသက်ဆိုင်ဘဲ သီးခြား စောင့်ကြည့်ပေးပါသည်။
                </div>
                <button
                  className={`mt-4 rounded-full px-5 py-3 text-sm font-headline font-bold transition-all ${
                    notificationChannels.temperature
                      ? 'border border-outline/10 bg-white text-primary hover:bg-primary hover:text-white'
                      : 'bg-primary text-on-primary shadow-lg hover:shadow-xl'
                  }`}
                  onClick={() => {
                    void toggleNotificationChannel('temperature')
                  }}
                  type="button"
                >
                  {notificationChannels.temperature ? 'Temperature alert ကို ပိတ်ရန်' : 'Temperature alert ကို ဖွင့်ရန်'}
                </button>
              </div>
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
          <button
            className="text-primary font-headline font-bold text-sm hover:underline"
            onClick={() => navigateToView('alerts')}
            type="button"
          >
            အားလုံးကြည့်ရန်
          </button>
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
    </div>
  )

  const renderAlertsView = () => (
    <div className="space-y-6">
      <section className="bg-white rounded-3xl p-6 md:p-8 border border-outline/10 shadow-[0_12px_48px_rgba(27,29,14,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-label text-primary text-sm font-bold uppercase tracking-widest">Notifications</p>
            <h3 className="text-3xl font-headline font-extrabold">Real-Time Temperature Feed</h3>
            <p className="text-on-surface-variant font-body mt-2">မြန်မာနိုင်ငံအနှံ့ အပူချိန် notification များကို ၂ စက္ကန့်တစ်ကြိမ် live refresh လုပ်ပေးနေပါသည်။</p>
          </div>
          <div className="rounded-2xl bg-surface-container px-4 py-3 border border-outline/10 min-w-[170px]">
            <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Live Refresh</div>
            <div className="mt-1 flex items-center gap-2 text-2xl font-headline font-extrabold">
              <span className="inline-block h-3 w-3 rounded-full bg-primary animate-pulse"></span>
              2s
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="space-y-4">
          {notificationsError ? (
            <div className="bg-error-container text-on-error-container rounded-3xl p-5 border border-error/10">
              {notificationsError}
            </div>
          ) : null}

          {temperatureNotifications.length > 0 ? (
            temperatureNotifications.map((alert) => (
              <button
                key={`${alert.location}-${alert.crop}-${alert.risk}`}
                className="w-full text-left bg-surface-container-low rounded-3xl p-5 border border-outline/5 hover:bg-white transition-all"
                onClick={() => setSelectedNotification(alert)}
                type="button"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="px-3 py-1 rounded-full text-xs font-label font-bold uppercase bg-primary-container text-on-primary-container">
                        Temp Live
                      </span>
                      <span className="text-xs text-on-surface-variant font-label">
                        Updated {formatForecastTime(lastFeedRefresh || alert.weather?.forecast_time)}
                      </span>
                    </div>
                    <h4 className="mt-2 font-headline text-xl font-bold text-on-surface">{alert.location}</h4>
                    <p className="text-sm text-on-surface-variant font-body mt-1">
                      Current temperature is {formatValue(alert.weather?.current_temperature_c, '°C', 1)} with humidity {formatValue(alert.weather?.current_humidity_pct, '%')} and rain outlook {formatValue(alert.weather?.rainfall_mm_next_3_days, ' mm', 1)}.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(alert.products || []).slice(0, 4).map((product) => (
                        <span
                          key={`${alert.location}-${product}`}
                          className="rounded-full bg-white px-3 py-1 text-xs font-headline font-bold text-primary border border-outline/10"
                        >
                          {product}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 border border-outline/10 min-w-[130px] text-center">
                    <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Current Temp</div>
                    <div className="mt-1 text-3xl font-headline font-extrabold text-primary">
                      {formatValue(alert.weather?.current_temperature_c, '°C', 1)}
                    </div>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="bg-surface-container-low rounded-3xl p-6 text-on-surface-variant">
              Live temperature notifications မရရှိသေးပါ။
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl p-6 border border-outline/10 space-y-4">
          <h4 className="font-headline text-xl font-bold">Feed Summary</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface-container-low p-4">
              <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Locations</div>
              <div className="mt-1 text-3xl font-headline font-extrabold">{temperatureNotifications.length}</div>
            </div>
            <div className="rounded-2xl bg-surface-container-low p-4">
              <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Last Sync</div>
              <div className="mt-1 text-sm font-headline font-bold">{formatForecastTime(lastFeedRefresh)}</div>
            </div>
          </div>

          <div className="rounded-2xl bg-surface-container-low p-4 border border-outline/10">
            <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Hottest Now</div>
            <div className="mt-2 font-headline font-bold text-lg">{hottestNotification?.location || 'Unavailable'}</div>
            <div className="text-on-surface-variant font-body mt-1">
              {hottestNotification ? formatValue(hottestNotification.weather?.current_temperature_c, '°C', 1) : 'Unavailable'}
            </div>
          </div>

          <div className="rounded-2xl bg-surface-container-low p-4 border border-outline/10">
            <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Coolest Now</div>
            <div className="mt-2 font-headline font-bold text-lg">{coolestNotification?.location || 'Unavailable'}</div>
            <div className="text-on-surface-variant font-body mt-1">
              {coolestNotification ? formatValue(coolestNotification.weather?.current_temperature_c, '°C', 1) : 'Unavailable'}
            </div>
          </div>

          {activeNotification ? (
            <>
              <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium bg-primary-container text-on-primary-container border-primary/10">
                Selected Temperature Notification
              </div>
              <div className="text-2xl font-headline font-extrabold">{activeNotification.location}</div>
              <div className="text-on-surface-variant font-body">
                {formatValue(activeNotification.weather?.current_temperature_c, '°C', 1)} current temperature, {formatValue(activeNotification.weather?.current_humidity_pct, '%')} humidity, and {formatValue(activeNotification.weather?.rainfall_mm_next_3_days, ' mm', 1)} rain in the next 3 days.
              </div>
              <div className="rounded-2xl bg-surface-container-low p-4">
                <div className="text-xs font-label text-on-surface-variant">Main Crops / Products</div>
                <div className="mt-2 font-headline font-bold">{formatProducts(activeNotification.products)}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-surface-container-low p-4">
                  <div className="text-xs font-label text-on-surface-variant">Humidity</div>
                  <div className="mt-1 font-headline font-bold">{formatValue(activeNotification.weather?.current_humidity_pct, '%')}</div>
                </div>
                <div className="rounded-2xl bg-surface-container-low p-4">
                  <div className="text-xs font-label text-on-surface-variant">Rain Outlook</div>
                  <div className="mt-1 font-headline font-bold">{formatValue(activeNotification.weather?.rainfall_mm_next_3_days, ' mm', 1)}</div>
                </div>
                <div className="rounded-2xl bg-surface-container-low p-4">
                  <div className="text-xs font-label text-on-surface-variant">Coordinates</div>
                  <div className="mt-1 font-headline font-bold">{formatCoordinates(activeNotification.weather)}</div>
                </div>
                <div className="rounded-2xl bg-surface-container-low p-4">
                  <div className="text-xs font-label text-on-surface-variant">Forecast Time</div>
                  <div className="mt-1 font-headline font-bold">{formatForecastTime(activeNotification.weather?.forecast_time)}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-on-surface-variant">Live temperature notification တစ်ခုကို ရွေးပါ။</div>
          )}
        </div>
      </section>
    </div>
  )

  const renderMapView = () => (
    <div className="space-y-6">
      <section className="bg-white rounded-3xl p-6 md:p-8 border border-outline/10 shadow-[0_12px_48px_rgba(27,29,14,0.06)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="font-label text-primary text-sm font-bold uppercase tracking-widest">Map</p>
            <h3 className="text-3xl font-headline font-extrabold">မြေပုံ</h3>
            <p className="text-on-surface-variant font-body mt-2">
              ရွေးထားသော တည်နေရာ သို့မဟုတ် သင့်လက်ရှိတည်နေရာကို မြေပုံပေါ်တွင် mark လုပ်ပြီး အပူချိန်နှင့် forecast summary ကို မြေပုံဘေးတွင် ချက်ချင်းကြည့်နိုင်ပါသည်။
            </p>
          </div>
          {mapLinks ? (
            <a
              className="bg-primary text-on-primary px-6 py-3 rounded-full font-headline font-bold shadow-lg hover:shadow-xl transition-all inline-flex items-center gap-2"
              href={mapLinks.externalUrl}
              rel="noreferrer"
              target="_blank"
            >
              <span className="material-symbols-outlined text-lg">open_in_new</span>
              မြေပုံအပြည့်ဖြင့် ဖွင့်ရန်
            </a>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.82fr)] gap-6 items-start">
        <div className="bg-white rounded-3xl p-4 md:p-6 border border-outline/10 shadow-[0_12px_48px_rgba(27,29,14,0.08)] overflow-hidden flex items-center justify-center">
          <div className="w-full max-w-[760px] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary-container px-4 py-2 text-sm font-headline font-bold text-on-primary-container">
                <span className="material-symbols-outlined text-base">place</span>
                {currentLocationLabel}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-surface-container-low px-4 py-2 text-sm font-headline font-bold text-on-surface">
                <span className="material-symbols-outlined text-primary text-base">device_thermostat</span>
                {currentTemperatureLabel}
              </div>
            </div>

            <form className="flex flex-col lg:flex-row gap-3" onSubmit={runMapLookup}>
              <label className="flex-1">
                <span className="sr-only">Map location menu</span>
                <div className="flex items-center gap-3 rounded-2xl border border-outline/10 bg-surface-container-low px-4 py-3 shadow-sm">
                  <span className="material-symbols-outlined text-primary">list</span>
                  <select
                    value={form.location}
                    onChange={(event) => updateField('location', event.target.value)}
                    className="w-full border-0 bg-transparent p-0 text-on-surface focus:ring-0"
                    disabled={locationOptions.length === 0}
                  >
                    {locationOptions.length === 0 ? (
                      <option value="">Location menu loading...</option>
                    ) : null}
                    {groupedLocationOptions.map((group) => (
                      <optgroup key={`map-${group.label}`} label={group.label}>
                        {group.items.map((option) => (
                          <option key={`map-${option.region}-${option.district}`} value={option.query}>
                            {option.district}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </label>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-headline font-bold text-on-primary shadow-lg hover:shadow-xl transition-all disabled:opacity-60"
                disabled={isSubmitting || isLocating}
                type="submit"
              >
                <span className="material-symbols-outlined text-lg">map</span>
                {isSubmitting ? 'ပြနေပါသည်...' : 'Show on map'}
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-outline/10 bg-white px-5 py-3 text-sm font-headline font-bold text-primary hover:bg-primary hover:text-white transition-all disabled:opacity-60"
                disabled={isSubmitting || isLocating}
                onClick={useCurrentLocation}
                type="button"
              >
                <span className="material-symbols-outlined text-lg">my_location</span>
                {isLocating ? 'GPS ရှာနေပါသည်...' : 'Use my location'}
              </button>
            </form>

            <div className="rounded-[2rem] overflow-hidden border border-outline/10 bg-surface-container-low relative">
              {mapLinks ? (
                <>
                  <div className="absolute left-4 top-4 z-10 max-w-[78%] rounded-full bg-white/95 px-4 py-2 text-sm font-headline font-bold text-primary shadow-lg backdrop-blur">
                    <span className="inline-flex items-center gap-2">
                      <span className="material-symbols-outlined text-base">location_on</span>
                      <span className="truncate">{currentLocationLabel}</span>
                    </span>
                  </div>
                  <iframe
                    className="w-full h-[500px] md:h-[540px]"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={mapLinks.embedUrl}
                    title="Myanmar climate risk map"
                  />
                </>
              ) : (
                <div className="h-[500px] md:h-[540px] flex items-center justify-center text-on-surface-variant font-body px-6 text-center">
                  တည်နေရာဒေတာ မရရှိသေးပါ။ Alert တစ်ခုကို ရွေးချယ်ပါ။
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5 self-start">
          <div className="bg-white rounded-3xl p-6 border border-outline/10 shadow-[0_12px_48px_rgba(27,29,14,0.04)]">
            <div className="flex items-center gap-3">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${currentMeta.iconPanelClass}`}>
                <span className="material-symbols-outlined text-3xl">{currentMeta.icon}</span>
              </div>
              <div>
                <div className="text-sm text-on-surface-variant font-label">Location Markup</div>
                <div className="text-xl font-headline font-bold">{currentLocationLabel}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface-container-low p-4 border border-outline/10">
                <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Current Temp</div>
                <div className="mt-1 text-3xl font-headline font-extrabold">{currentTemperatureLabel}</div>
              </div>
              <div className="rounded-2xl bg-surface-container-low p-4 border border-outline/10">
                <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Coordinates</div>
                <div className="mt-1 text-lg font-headline font-bold">{formatCoordinates(currentAlert?.weather)}</div>
              </div>
              <div className="rounded-2xl bg-surface-container-low p-4 border border-outline/10">
                <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Risk</div>
                <div className="mt-1 text-lg font-headline font-bold">{currentAlert?.risk || 'Unavailable'}</div>
              </div>
              <div className="rounded-2xl bg-surface-container-low p-4 border border-outline/10">
                <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Forecast Time</div>
                <div className="mt-1 text-sm font-headline font-bold">{formatForecastTime(currentAlert?.weather?.forecast_time)}</div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-surface-container-low p-4 border border-outline/10 text-sm text-on-surface-variant font-body">
              {currentAlert?.advice || 'မြေပုံအတွက် live alert တစ်ခုကို ရွေးချယ်ပါ။'}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-outline/10 space-y-4">
            <h4 className="font-headline text-xl font-bold">မြေပုံပေါ်တွင် ကြည့်ရန်</h4>
            {alerts.length > 0 ? (
              alerts.map((alert) => (
                <button
                  key={`${alert.location}-${alert.crop}-${alert.risk}`}
                  className="w-full text-left rounded-2xl bg-surface-container-low p-4 hover:bg-surface-container transition-all"
                  onClick={() => focusAlert(alert, 'map')}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-headline font-bold">{alert.location}</div>
                      <div className="text-xs text-on-surface-variant font-label mt-1">
                        {formatValue(alert.weather?.current_temperature_c, '°C', 1)} • {formatValue(alert.weather?.rainfall_mm_next_3_days, ' mm', 1)} rain
                      </div>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${badgeClass(alert.risk)}`}>
                      {alert.crop}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <div className="text-on-surface-variant">Live map locations မရရှိသေးပါ။</div>
            )}
          </div>
        </div>
      </section>
    </div>
  )

  const renderGuideView = () => (
    <div className="space-y-6">
      <section className="bg-white rounded-3xl p-6 md:p-8 border border-outline/10 shadow-[0_12px_48px_rgba(27,29,14,0.06)]">
        <p className="font-label text-primary text-sm font-bold uppercase tracking-widest">Guide</p>
        <h3 className="text-3xl font-headline font-extrabold mt-1">လမ်းညွှန်</h3>
        <p className="text-on-surface-variant font-body mt-2">
          Live alert အမျိုးအစားအလိုက် စိုက်ပျိုးရေး လုပ်ဆောင်ရန် အကြံပြုချက်များနှင့် SMS message အသုံးပြုနည်းများကို စုစည်းထားပါသည်။
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {guideCards.map((card) => (
          <article key={card.title} className="bg-surface-container-low rounded-3xl p-6 border border-outline/10">
            <div className="w-14 h-14 rounded-2xl bg-primary-container text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl">{card.icon}</span>
            </div>
            <h4 className="mt-4 font-headline text-xl font-bold">{card.title}</h4>
            <p className="mt-2 text-on-surface-variant font-body leading-7">{card.body}</p>
          </article>
        ))}
      </section>

      <section className="bg-white rounded-3xl p-6 border border-outline/10 shadow-[0_12px_48px_rgba(27,29,14,0.06)]">
        <h4 className="font-headline text-xl font-bold">လက်ရှိ alert အတွက် အကြံပြုချက်</h4>
        <div className="mt-4 rounded-2xl bg-surface-container-low p-5 text-on-surface-variant font-body">
          {currentAlert?.advice || 'Live alert တစ်ခုကို ရွေးချယ်ပါ။'}
        </div>
        <div className="mt-4 rounded-2xl bg-[#1b1d0e] text-white p-5 shadow-inner">
          <div className="text-xs uppercase tracking-wide text-white/50">SMS Preview</div>
          <p className="mt-3 text-sm leading-6 font-body">
            {currentAlert?.sms || 'လမ်းညွှန်ကဏ္ဍတွင် SMS sample ကို ကြည့်ရန် live alert တစ်ခုလိုအပ်ပါသည်။'}
          </p>
        </div>
      </section>
    </div>
  )

  const renderAdminNotificationView = () => (
    <main className="min-h-screen px-6 py-10 max-w-5xl mx-auto space-y-6">
      <section className="bg-white rounded-3xl p-6 md:p-8 border border-outline/10 shadow-[0_12px_48px_rgba(27,29,14,0.06)]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-xs uppercase font-label text-primary tracking-widest">Hidden Admin Page</div>
            <h1 className="mt-1 text-3xl font-headline font-extrabold">Broadcast Notification Sender</h1>
            <p className="mt-2 text-on-surface-variant font-body">
              ဒီ page ကို nav ထဲမှာ မပြထားပါ။ Header နဲ့ message body ကို ရေးပြီး message sender ပုံစံနဲ့ active users အားလုံးဆီသို့ web notification ပို့နိုင်ပါသည်။
            </p>
          </div>
          <a
            className="inline-flex items-center gap-2 rounded-full border border-outline/10 bg-white px-5 py-3 text-sm font-headline font-bold text-primary hover:bg-primary hover:text-white transition-all"
            href="/"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Dashboard သို့ ပြန်ရန်
          </a>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="bg-white rounded-3xl p-6 md:p-8 border border-outline/10 shadow-[0_12px_48px_rgba(27,29,14,0.06)]">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-14 h-14 rounded-2xl bg-primary-container text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl">campaign</span>
            </div>
            <div>
              <h3 className="font-headline text-2xl font-bold">Send Admin Notification</h3>
              <p className="text-sm text-on-surface-variant font-label">Header နဲ့ body ကို ဖြည့်ပြီး active sessions ဆီသို့ ချက်ချင်း broadcast လုပ်ပါ</p>
            </div>
          </div>

          <form className="space-y-5" onSubmit={sendAdminBroadcast}>
            <label className="block">
              <span className="text-sm font-label font-bold text-on-surface-variant">Notification Header</span>
              <input
                value={adminBroadcastForm.title}
                onChange={(event) => updateAdminBroadcastField('title', event.target.value)}
                className="mt-2 w-full rounded-2xl border-outline/10 bg-surface-container-low px-4 py-3.5 text-on-surface focus:border-primary focus:ring-primary"
                maxLength={120}
                placeholder="ဥပမာ - မိုးသက်လေပြင်း သတိထားပါ"
                type="text"
              />
            </label>

            <label className="block">
              <span className="text-sm font-label font-bold text-on-surface-variant">Message Body</span>
              <textarea
                value={adminBroadcastForm.body}
                onChange={(event) => updateAdminBroadcastField('body', event.target.value)}
                className="mt-2 min-h-[180px] w-full rounded-2xl border-outline/10 bg-surface-container-low px-4 py-3.5 text-on-surface focus:border-primary focus:ring-primary"
                maxLength={500}
                placeholder="Users အားလုံးကို ပို့လိုသော message ကို ဒီနေရာမှာ ရေးပါ"
              />
            </label>

            {adminBroadcastError ? (
              <div className="rounded-2xl bg-error-container px-4 py-3 text-sm font-body text-on-error-container">
                {adminBroadcastError}
              </div>
            ) : null}

            {adminBroadcastStatus ? (
              <div className="rounded-2xl bg-primary-container px-4 py-3 text-sm font-body text-on-primary-container">
                {adminBroadcastStatus}
              </div>
            ) : null}

            <button
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-3 text-sm font-headline font-bold text-on-primary shadow-lg hover:shadow-xl transition-all disabled:opacity-60"
              disabled={isSendingAdminBroadcast}
              type="submit"
            >
              <span className="material-symbols-outlined text-lg">send</span>
              {isSendingAdminBroadcast ? 'Sending...' : 'Send To All Active Users'}
            </button>
          </form>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-3xl p-6 border border-outline/10 shadow-[0_12px_48px_rgba(27,29,14,0.04)]">
            <div className="text-xs uppercase font-label text-primary tracking-widest">Current Broadcast</div>
            {currentBroadcast ? (
              <>
                <div className="mt-3 text-2xl font-headline font-extrabold">{currentBroadcast.title}</div>
                <div className="mt-3 rounded-2xl bg-surface-container-low p-4 text-on-surface-variant font-body leading-7">
                  {currentBroadcast.body}
                </div>
                <div className="mt-3 text-sm text-on-surface-variant font-label">
                  Last sent: {formatForecastTime(currentBroadcast.created_at)}
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-2xl bg-surface-container-low p-4 text-on-surface-variant font-body">
                No admin broadcast has been sent yet.
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl p-6 border border-outline/10 shadow-[0_12px_48px_rgba(27,29,14,0.04)]">
            <div className="text-xs uppercase font-label text-primary tracking-widest">How It Works</div>
            <div className="mt-3 space-y-3 text-sm text-on-surface-variant font-body">
              <p>Users who granted notification permission will receive the admin message as a system notification.</p>
              <p>This works for active/open web app sessions with the current architecture.</p>
              <p>This hidden page now sends directly without asking for an admin key.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )

  const renderMainView = () => {
    switch (activeView) {
      case 'alerts':
        return renderAlertsView()
      case 'map':
        return renderMapView()
      case 'guide':
        return renderGuideView()
      default:
        return renderHomeView()
    }
  }

  if (activeView === ADMIN_VIEW_ID) {
    return renderAdminNotificationView()
  }

  return (
    <>
      {installGateActive ? (
        <div className="fixed inset-0 z-[120] bg-[radial-gradient(circle_at_top,#f7f2c5_0%,#fbfbe2_45%,#efefd7_100%)] px-6 py-8 overflow-y-auto">
          <div className="min-h-full max-w-3xl mx-auto flex items-center justify-center">
            <div className="w-full bg-white/95 backdrop-blur-xl rounded-[2rem] border border-outline/10 shadow-[0_24px_80px_rgba(27,29,14,0.18)] p-6 md:p-10 space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-3xl bg-primary-container text-primary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-4xl">download</span>
                </div>
                <div>
                  <div className="text-xs uppercase font-label text-primary tracking-[0.24em]">Install Required</div>
                  <h2 className="mt-2 text-3xl md:text-4xl font-headline font-extrabold text-on-surface">
                    Home Screen app အဖြစ် install လုပ်ပြီးမှ ဝင်နိုင်ပါမည်
                  </h2>
                  <p className="mt-3 text-base md:text-lg text-on-surface-variant font-body leading-8">
                    Climate Monitor ကို first-time visitor အဖြစ် browser ထဲကနေ တိုက်ရိုက်မသုံးနိုင်ပါ။ Web app ကို Home Screen ပေါ်တင်ပြီး app mode ဖြင့်ဖွင့်ထားမှ dashboard ကို ဆက်လက်အသုံးပြုနိုင်ပါမည်။
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-3xl bg-surface-container-low p-5 border border-outline/10">
                  <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Why</div>
                  <div className="mt-2 font-headline font-bold text-xl">App mode only</div>
                  <p className="mt-2 text-sm text-on-surface-variant font-body leading-7">
                    Notification, offline cache, and app-style experience တွေကို အပြည့်အဝသုံးရန် Home Screen install လိုအပ်ပါသည်။
                  </p>
                </div>
                <div className="rounded-3xl bg-surface-container-low p-5 border border-outline/10">
                  <div className="text-xs uppercase font-label text-on-surface-variant tracking-wide">Status</div>
                  <div className="mt-2 font-headline font-bold text-xl">
                    {installGateCanPrompt ? 'Install prompt အဆင်သင့်ဖြစ်ပါပြီ' : usesIosInstallFlow ? 'Manual Home Screen steps လိုအပ်ပါသည်' : 'Browser install prompt ကိုစောင့်နေပါသည်'}
                  </div>
                  <p className="mt-2 text-sm text-on-surface-variant font-body leading-7">
                    {installGateStatus || (usesIosInstallFlow
                      ? 'Safari Share menu က Add to Home Screen ကို သုံးပါ။'
                      : 'Install button ပေါ်လာလျှင် နှိပ်ပြီး app ကို Home Screen ပေါ်တင်ပါ။')}
                  </p>
                </div>
              </div>

              <div className="rounded-3xl bg-white p-5 border border-outline/10">
                <div className="text-sm font-headline font-bold text-on-surface">Important browser limit</div>
                <p className="mt-2 text-sm text-on-surface-variant font-body leading-7">
                  Install ပြီးသွားလျှင် browser tab က installed Home Screen app ကို တိုက်ရိုက်ဖွင့်မပေးနိုင်ပါ။ Climate Monitor icon ကို Home Screen ပေါ်ကနေ ကိုယ်တိုင်နှိပ်ဖွင့်ရပါမည်။
                </p>
              </div>

              {usesIosInstallFlow ? (
                <div className="rounded-3xl bg-primary-container/40 p-5 border border-primary/10">
                  <div className="text-sm font-headline font-bold text-primary">iPhone / iPad steps</div>
                  <div className="mt-3 space-y-2 text-sm text-on-surface-variant font-body leading-7">
                    <p>1. Safari bottom or top bar မှ <span className="font-bold text-on-surface">Share</span> ကိုနှိပ်ပါ။</p>
                    <p>2. <span className="font-bold text-on-surface">Add to Home Screen</span> ကိုရွေးပါ။</p>
                    <p>3. Home Screen ပေါ်က <span className="font-bold text-on-surface">Climate Monitor</span> app icon ကိုဖွင့်ပါ။</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl bg-primary-container/40 p-5 border border-primary/10">
                  <div className="text-sm font-headline font-bold text-primary">Android phone install</div>
                  <div className="mt-3 space-y-2 text-sm text-on-surface-variant font-body leading-7">
                    <p>1. Install button ကိုနှိပ်ပါ။</p>
                    <p>2. Browser prompt မှ install ကိုအတည်ပြုပါ။</p>
                    <p>3. Install ပြီးသွားလျှင် Home Screen ပေါ်က Climate Monitor app ကိုဖွင့်ပါ။</p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  className="flex-1 rounded-full bg-primary px-6 py-4 text-base font-headline font-bold text-on-primary shadow-lg hover:shadow-xl transition-all disabled:opacity-60"
                  disabled={!installGateCanPrompt}
                  onClick={() => {
                    void triggerInstallPrompt()
                  }}
                  type="button"
                >
                  {installGateCanPrompt ? 'Web app ကို install လုပ်ရန်' : 'Install prompt မရသေးပါ'}
                </button>
                <button
                  className="flex-1 rounded-full border border-outline/10 bg-white px-6 py-4 text-base font-headline font-bold text-primary hover:bg-primary hover:text-white transition-all"
                  onClick={refreshInstallGateStatus}
                  type="button"
                >
                  App mode ကို စစ်ဆေးရန်
                </button>
              </div>

              <div className="rounded-3xl bg-surface-container-low p-5 border border-outline/10 text-sm text-on-surface-variant font-body leading-7">
                Admin page ကိုသာ browser ထဲကနေ ဆက်သုံးနိုင်ပြီး normal dashboard usage အတွက် install gate ကိုဖြတ်ရပါမည်။
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isAutoUpdating ? (
        <div className="fixed inset-0 z-[120] bg-[radial-gradient(circle_at_top,rgba(251,251,226,0.95)_0%,rgba(245,245,220,0.92)_52%,rgba(234,234,209,0.94)_100%)] backdrop-blur-md flex items-center justify-center px-6">
          <div className="w-full max-w-sm rounded-[2rem] border border-primary/10 bg-white/76 px-8 py-8 text-center shadow-[0_24px_80px_rgba(45,106,79,0.12)]">
            <div className="mx-auto leaf-wave-loader" aria-hidden="true">
              <div className="leaf-wave-loader__line"></div>
              <span className="material-symbols-outlined leaf-wave-loader__leaf text-[2rem]" style={{ left: '6%', animationDelay: '0ms' }}>eco</span>
              <span className="material-symbols-outlined leaf-wave-loader__leaf text-[2.4rem]" style={{ left: '24%', animationDelay: '140ms' }}>eco</span>
              <span className="material-symbols-outlined leaf-wave-loader__leaf text-[2.8rem]" style={{ left: '43%', animationDelay: '280ms' }}>eco</span>
              <span className="material-symbols-outlined leaf-wave-loader__leaf text-[2.4rem]" style={{ left: '64%', animationDelay: '420ms' }}>eco</span>
              <span className="material-symbols-outlined leaf-wave-loader__leaf text-[2rem]" style={{ left: '82%', animationDelay: '560ms' }}>eco</span>
            </div>
            <div className="mt-5 text-xs uppercase tracking-[0.26em] font-label text-primary/80">Climate Monitor</div>
            <div className="mt-3 font-headline text-2xl font-extrabold text-primary">အသစ်ပြောင်းနေသည်</div>
          </div>
        </div>
      ) : null}

      {tabTransition ? (
        <div className="fixed inset-0 z-[110] bg-[radial-gradient(circle_at_top,rgba(251,251,226,0.92)_0%,rgba(245,245,220,0.88)_48%,rgba(234,234,209,0.9)_100%)] backdrop-blur-md flex items-center justify-center px-6">
          <div className="w-full max-w-md rounded-[2rem] border border-primary/10 bg-white/72 px-8 py-8 text-center shadow-[0_24px_80px_rgba(45,106,79,0.12)]">
            <div className="mx-auto leaf-wave-loader" aria-hidden="true">
              <div className="leaf-wave-loader__line"></div>
              <span className="material-symbols-outlined leaf-wave-loader__leaf text-[2rem]" style={{ left: '6%', animationDelay: '0ms' }}>eco</span>
              <span className="material-symbols-outlined leaf-wave-loader__leaf text-[2.4rem]" style={{ left: '24%', animationDelay: '140ms' }}>eco</span>
              <span className="material-symbols-outlined leaf-wave-loader__leaf text-[2.8rem]" style={{ left: '43%', animationDelay: '280ms' }}>eco</span>
              <span className="material-symbols-outlined leaf-wave-loader__leaf text-[2.4rem]" style={{ left: '64%', animationDelay: '420ms' }}>eco</span>
              <span className="material-symbols-outlined leaf-wave-loader__leaf text-[2rem]" style={{ left: '82%', animationDelay: '560ms' }}>eco</span>
            </div>
            <div className="mt-5 text-xs uppercase tracking-[0.26em] font-label text-primary/80">Leaf Wave</div>
            <div className="mt-3 font-headline text-2xl font-extrabold text-primary">{tabTransition.label}</div>
          </div>
        </div>
      ) : null}

      <aside className="hidden xl:flex fixed left-0 top-0 h-full z-40 flex-col bg-surface-container-low w-72 border-r border-outline/10">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-primary text-3xl">eco</span>
            <h1 className="text-xl font-bold text-primary tracking-tight font-headline leading-tight">Climate Monitor</h1>
          </div>
          <p className="text-on-surface-variant text-sm font-label opacity-70">စိုက်ပျိုးရေးအဖော်မွန်</p>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {views.map((item) => {
            const active = item.id === activeView
            return (
              <button
                key={item.id}
                className={
                  active
                    ? 'w-full flex items-center gap-4 bg-primary text-on-primary px-6 py-4 rounded-2xl shadow-lg transition-all font-headline'
                    : 'w-full flex items-center gap-4 text-on-surface-variant px-6 py-4 hover:bg-surface-container rounded-2xl transition-all font-headline'
                }
                onClick={() => navigateToView(item.id)}
                type="button"
              >
                <span
                  className="material-symbols-outlined"
                  style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {item.icon}
                </span>
                <span className={active ? 'font-bold' : 'font-medium'}>{item.label}</span>
              </button>
            )
          })}
        </nav>

      </aside>

      <header className="bg-surface/80 backdrop-blur-lg border-b border-outline/10 fixed top-0 left-0 xl:left-72 right-0 z-50">
        <div className="relative w-full max-w-5xl mx-auto px-6">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-xl font-bold text-primary font-headline">{activeViewMeta.label}</h2>
                <p className="text-xs text-on-surface-variant font-label">{currentAlert?.location || 'Myanmar Live Feed'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="p-2.5 rounded-full hover:bg-surface-container-high text-on-surface-variant transition-all active:scale-90"
                onClick={() => setIsQuickSearchOpen((prev) => !prev)}
                type="button"
              >
                <span className="material-symbols-outlined">search</span>
              </button>
              <button
                className="p-2.5 rounded-full hover:bg-surface-container-high text-on-surface-variant relative transition-all active:scale-90"
                onClick={() => navigateToView('alerts')}
                type="button"
              >
                <span className="material-symbols-outlined">notifications</span>
                {alerts.length > 0 ? <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full"></span> : null}
              </button>
            </div>
          </div>

          {isQuickSearchOpen ? (
            <div className="absolute top-[calc(100%+0.75rem)] left-0 right-0 md:left-auto md:right-6 md:w-[420px] rounded-3xl bg-white border border-outline/10 shadow-[0_18px_48px_rgba(27,29,14,0.14)] p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase font-label text-primary tracking-wide">Quick Search</div>
                  <div className="mt-1 font-headline text-xl font-bold">တည်နေရာရွေးပြီး စစ်ဆေးရန်</div>
                </div>
                <button
                  className="rounded-full bg-surface-container-low p-2 text-on-surface-variant hover:bg-surface-container-high transition-all"
                  onClick={() => setIsQuickSearchOpen(false)}
                  type="button"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              <label className="block">
                <span className="text-sm font-label font-bold text-on-surface-variant">မြန်မာတည်နေရာ</span>
                <select
                  value={form.location}
                  onChange={(event) => updateField('location', event.target.value)}
                  className="mt-2 w-full rounded-2xl border-outline/10 bg-surface-container-low px-4 py-3.5 text-on-surface focus:border-primary focus:ring-primary"
                  disabled={locationOptions.length === 0}
                >
                  {locationOptions.length === 0 ? <option value="">Location menu loading...</option> : null}
                  {groupedLocationOptions.map((group) => (
                    <optgroup key={`quick-${group.label}`} label={group.label}>
                      {group.items.map((option) => (
                        <option key={`quick-${option.region}-${option.district}`} value={option.query}>
                          {option.district}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-label font-bold text-on-surface-variant">သီးနှံအမျိုးအစား</span>
                <select
                  value={form.crop}
                  onChange={(event) => updateField('crop', event.target.value)}
                  className="mt-2 w-full rounded-2xl border-outline/10 bg-surface-container-low px-4 py-3.5 text-on-surface focus:border-primary focus:ring-primary"
                >
                  {cropOptions.map((crop) => (
                    <option key={`quick-${crop}`} value={crop}>{crop}</option>
                  ))}
                </select>
              </label>

              <div className="rounded-2xl bg-surface-container-low p-4 text-sm text-on-surface-variant font-body">
                {selectedLocationOption ? `${formatLocationOptionSummary(selectedLocationOption)} • ${formatProducts(selectedLocationOption.products)}` : 'Location menu loading...'}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  className="rounded-2xl bg-primary px-5 py-3 text-sm font-headline font-bold text-on-primary shadow-lg hover:shadow-xl transition-all disabled:opacity-60"
                  disabled={isSubmitting || isLocating || !form.location}
                  onClick={() => {
                    void runQuickSearch('home')
                  }}
                  type="button"
                >
                  Live Risk စစ်ဆေးရန်
                </button>
                <button
                  className="rounded-2xl border border-outline/10 bg-white px-5 py-3 text-sm font-headline font-bold text-primary hover:bg-primary hover:text-white transition-all disabled:opacity-60"
                  disabled={isSubmitting || isLocating || !form.location}
                  onClick={() => {
                    void runQuickSearch('map')
                  }}
                  type="button"
                >
                  မြေပုံတွင်ဖွင့်ရန်
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <main className="pt-28 px-6 pb-12 max-w-5xl mx-auto">
        {renderMainView()}
      </main>

      <nav className="xl:hidden fixed bottom-0 left-0 w-full flex justify-around items-center px-4 py-4 pb-8 bg-surface/90 backdrop-blur-xl border-t border-outline/10 shadow-[0_-8px_32px_rgba(27,29,14,0.1)] z-50">
        {views.map((item) => {
          const active = item.id === activeView
          return (
            <button
              key={item.id}
              className={
                active
                  ? 'flex flex-col items-center gap-1 text-primary bg-primary-container/30 px-6 py-2 rounded-2xl transition-all active:scale-90'
                  : 'flex flex-col items-center gap-1 text-on-surface-variant opacity-60 transition-all active:scale-90'
              }
              onClick={() => navigateToView(item.id)}
              type="button"
            >
              <span
                className="material-symbols-outlined"
                style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              <span className="font-headline text-[11px] font-bold">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
