import asyncio
import json
import os
import time
from functools import lru_cache
from typing import List
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title='Climate Risk Prediction API', version='0.1.0')

GEOCODING_API_URL = 'https://geocoding-api.open-meteo.com/v1/search'
FORECAST_API_URL = 'https://api.open-meteo.com/v1/forecast'
MYANMAR_LOCATION_ALIASES = {
    'naypyidaw': 'Nay Pyi Taw',
    'nay pyi taw': 'Nay Pyi Taw',
    'pyinoolwin': 'Pyin Oo Lwin',
    'pyin oo lwin': 'Pyin Oo Lwin',
    'sittwe': 'Sittwe',
    'pathein': 'Pathein',
    'taunggyi': 'Taunggyi',
    'mawlamyine': 'Mawlamyine',
    'yangon': 'Yangon',
    'mandalay': 'Mandalay',
    'bago': 'Bago',
    'magway': 'Magway',
    'hlegu': 'Hlegu',
    'ရန်ကုန်': 'Yangon',
    'မန္တလေး': 'Mandalay',
    'ပဲခူး': 'Bago',
    'မကွေး': 'Magway',
    'နေပြည်တော်': 'Nay Pyi Taw',
}
NOTIFICATION_CACHE_TTL_SECONDS = 300.0
SAMPLE_ALERT_ITEMS = [
    {'label': 'Hlegu', 'query': 'Hlegu', 'region': 'Yangon Region', 'crop': 'Rice'},
    {'label': 'Magway', 'query': 'Magway', 'region': 'Magway Region', 'crop': 'Sesame'},
    {'label': 'Bago', 'query': 'Bago', 'region': 'Bago Region', 'crop': 'Pulses'},
]
WATCHLIST_ITEMS = [
    {'label': 'Yangon (East)', 'query': 'East Yangon District', 'region': 'Yangon Region', 'crop': 'Rice'},
    {'label': 'Yangon (West)', 'query': 'West Yangon District', 'region': 'Yangon Region', 'crop': 'Rice'},
    {'label': 'Yangon (North)', 'query': 'North Yangon District', 'region': 'Yangon Region', 'crop': 'Rice'},
    {'label': 'Yangon (South)', 'query': 'South Yangon District', 'region': 'Yangon Region', 'crop': 'Rice'},
    {'label': 'Mandalay', 'query': 'Mandalay', 'region': 'Mandalay Region', 'crop': 'Maize'},
    {'label': 'Kyaukse', 'query': 'Kyaukse', 'region': 'Mandalay Region', 'crop': 'Groundnut'},
    {'label': 'Meiktila', 'query': 'Meiktila', 'region': 'Mandalay Region', 'crop': 'Sesame'},
    {'label': 'Myingyan', 'query': 'Myingyan', 'region': 'Mandalay Region', 'crop': 'Pulses'},
    {'label': 'Nyaung-U', 'query': 'Nyaung-U', 'region': 'Mandalay Region', 'crop': 'Groundnut'},
    {'label': 'Yamethin', 'query': 'Yamethin', 'region': 'Mandalay Region', 'crop': 'Sesame'},
    {'label': 'Pyin Oo Lwin', 'query': 'Pyin Oo Lwin', 'region': 'Mandalay Region', 'crop': 'Vegetables'},
    {'label': 'Bago', 'query': 'Bago', 'region': 'Bago Region', 'crop': 'Rice'},
    {'label': 'Taungoo', 'query': 'Taungoo', 'region': 'Bago Region', 'crop': 'Rice'},
    {'label': 'Pyay', 'query': 'Pyay', 'region': 'Bago Region', 'crop': 'Pulses'},
    {'label': 'Tharrawaddy', 'query': 'Tharrawaddy', 'region': 'Bago Region', 'crop': 'Rice'},
    {'label': 'Pathein', 'query': 'Pathein', 'region': 'Ayeyarwady Region', 'crop': 'Rice'},
    {'label': 'Myaungmya', 'query': 'Myaungmya', 'region': 'Ayeyarwady Region', 'crop': 'Rice'},
    {'label': 'Hinthada', 'query': 'Hinthada', 'region': 'Ayeyarwady Region', 'crop': 'Rice'},
    {'label': 'Maubin', 'query': 'Maubin', 'region': 'Ayeyarwady Region', 'crop': 'Rice'},
    {'label': 'Pyapon', 'query': 'Pyapon', 'region': 'Ayeyarwady Region', 'crop': 'Rice'},
    {'label': 'Labutta', 'query': 'Labutta', 'region': 'Ayeyarwady Region', 'crop': 'Rice'},
    {'label': 'Magway', 'query': 'Magway', 'region': 'Magway Region', 'crop': 'Sesame'},
    {'label': 'Minbu', 'query': 'Minbu', 'region': 'Magway Region', 'crop': 'Sesame'},
    {'label': 'Thayet', 'query': 'Thayet', 'region': 'Magway Region', 'crop': 'Groundnut'},
    {'label': 'Pakokku', 'query': 'Pakokku', 'region': 'Magway Region', 'crop': 'Groundnut'},
    {'label': 'Gangaw', 'query': 'Gangaw', 'region': 'Magway Region', 'crop': 'Pulses'},
    {'label': 'Sagaing', 'query': 'Sagaing', 'region': 'Sagaing Region', 'crop': 'Pulses'},
    {'label': 'Shwebo', 'query': 'Shwebo', 'region': 'Sagaing Region', 'crop': 'Rice'},
    {'label': 'Monywa', 'query': 'Monywa', 'region': 'Sagaing Region', 'crop': 'Pulses'},
    {'label': 'Katha', 'query': 'Katha', 'region': 'Sagaing Region', 'crop': 'Rice'},
    {'label': 'Kale', 'query': 'Kale', 'region': 'Sagaing Region', 'crop': 'Maize'},
    {'label': 'Tamu', 'query': 'Tamu', 'region': 'Sagaing Region', 'crop': 'Maize'},
    {'label': 'Mawlaik', 'query': 'Mawlaik', 'region': 'Sagaing Region', 'crop': 'Rice'},
    {'label': 'Hkamti', 'query': 'Hkamti', 'region': 'Sagaing Region', 'crop': 'Rice'},
    {'label': 'Dawei', 'query': 'Dawei', 'region': 'Tanintharyi Region', 'crop': 'Rubber'},
    {'label': 'Myeik', 'query': 'Myeik', 'region': 'Tanintharyi Region', 'crop': 'Rubber'},
    {'label': 'Kawthaung', 'query': 'Kawthaung', 'region': 'Tanintharyi Region', 'crop': 'Rubber'},
    {'label': 'Myitkyina', 'query': 'Myitkyina', 'region': 'Kachin State', 'crop': 'Rice'},
    {'label': 'Bhamo', 'query': 'Bhamo', 'region': 'Kachin State', 'crop': 'Rice'},
    {'label': 'Mohnyin', 'query': 'Mohnyin', 'region': 'Kachin State', 'crop': 'Rice'},
    {'label': 'Putao', 'query': 'Putao', 'region': 'Kachin State', 'crop': 'Rice'},
    {'label': 'Loikaw', 'query': 'Loikaw', 'region': 'Kayah State', 'crop': 'Maize'},
    {'label': 'Bawlakhe', 'query': 'Bawlakhe', 'region': 'Kayah State', 'crop': 'Maize'},
    {'label': 'Hpa-An', 'query': 'Hpa-An', 'region': 'Kayin State', 'crop': 'Rice'},
    {'label': 'Myawaddy', 'query': 'Myawaddy', 'region': 'Kayin State', 'crop': 'Maize'},
    {'label': 'Kawkareik', 'query': 'Kawkareik', 'region': 'Kayin State', 'crop': 'Rice'},
    {'label': 'Hakha', 'query': 'Hakha', 'region': 'Chin State', 'crop': 'Maize'},
    {'label': 'Falam', 'query': 'Falam', 'region': 'Chin State', 'crop': 'Maize'},
    {'label': 'Mindat', 'query': 'Mindat', 'region': 'Chin State', 'crop': 'Maize'},
    {'label': 'Matupi', 'query': 'Matupi', 'region': 'Chin State', 'crop': 'Maize'},
    {'label': 'Mawlamyine', 'query': 'Mawlamyine', 'region': 'Mon State', 'crop': 'Rubber'},
    {'label': 'Thaton', 'query': 'Thaton', 'region': 'Mon State', 'crop': 'Rice'},
    {'label': 'Sittwe', 'query': 'Sittwe', 'region': 'Rakhine State', 'crop': 'Rice'},
    {'label': 'Thandwe', 'query': 'Thandwe', 'region': 'Rakhine State', 'crop': 'Rice'},
    {'label': 'Kyaukpyu', 'query': 'Kyaukpyu', 'region': 'Rakhine State', 'crop': 'Rice'},
    {'label': 'Maungdaw', 'query': 'Maungdaw', 'region': 'Rakhine State', 'crop': 'Rice'},
    {'label': 'Mrauk-U', 'query': 'Mrauk-U', 'region': 'Rakhine State', 'crop': 'Rice'},
    {'label': 'Taunggyi', 'query': 'Taunggyi', 'region': 'Shan State', 'crop': 'Vegetables'},
    {'label': 'Lashio', 'query': 'Lashio', 'region': 'Shan State', 'crop': 'Maize'},
    {'label': 'Kengtung', 'query': 'Kengtung', 'region': 'Shan State', 'crop': 'Rice'},
    {'label': 'Muse', 'query': 'Muse', 'region': 'Shan State', 'crop': 'Rice'},
    {'label': 'Loilen', 'query': 'Loilen', 'region': 'Shan State', 'crop': 'Rice'},
    {'label': 'Langkho', 'query': 'Langkho', 'region': 'Shan State', 'crop': 'Rice'},
    {'label': 'Mong Hsat', 'query': 'Mong Hsat', 'region': 'Shan State', 'crop': 'Rice'},
    {'label': 'Mong Ton', 'query': 'Mong Ton', 'region': 'Shan State', 'crop': 'Rice'},
    {'label': 'Tachileik', 'query': 'Tachileik', 'region': 'Shan State', 'crop': 'Rice'},
    {'label': 'Kyaukme', 'query': 'Kyaukme', 'region': 'Shan State', 'crop': 'Rice'},
]
GEOCODE_CACHE: dict[str, dict] = {}
WATCHLIST_CACHE: dict[str, object] = {'timestamp': 0.0, 'alerts': []}


@lru_cache
def get_allowed_origins() -> List[str]:
    raw_origins = os.getenv(
        'ALLOWED_ORIGINS',
        'http://127.0.0.1:5173,http://localhost:5173,https://climate-risk-prototype.kaungkhantko.top',
    )
    return [origin.strip() for origin in raw_origins.split(',') if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
)


class PredictRequest(BaseModel):
    location: str
    crop: str
    rainfall_mm_next_3_days: float | None = None
    temperature_c: float | None = None
    soil_moisture_pct: float | None = None
    wind_kph: float | None = None
    latitude: float | None = None
    longitude: float | None = None


class WeatherSnapshot(BaseModel):
    current_temperature_c: float
    current_humidity_pct: int
    rainfall_mm_next_3_days: float
    max_temperature_c_next_3_days: float
    max_wind_kph_next_3_days: float
    avg_soil_moisture_pct: float
    latitude: float | None = None
    longitude: float | None = None
    timezone: str | None = None
    forecast_time: str | None = None


class Alert(BaseModel):
    location: str
    crop: str
    risk: str
    confidence: int
    timing: str
    advice: str
    sms: str
    source: str
    weather: WeatherSnapshot


class BatchResponse(BaseModel):
    alerts: List[Alert]


def _mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _format_location_name(match: dict) -> str:
    parts = [match.get('name'), match.get('admin1'), match.get('country')]
    deduped = []
    for part in parts:
        if part and part not in deduped:
            deduped.append(part)
    return ', '.join(deduped)


def _build_sms(location: str, crop: str, risk: str, advice: str, weather: WeatherSnapshot) -> str:
    rain = round(weather.rainfall_mm_next_3_days)
    wind = round(weather.max_wind_kph_next_3_days)
    return (
        f'{risk} for {crop} near {location}. Rain next 3 days: {rain} mm. '
        f'Max wind: {wind} kph. {advice}'
    )


def _normalize_myanmar_query(query: str) -> str:
    normalized = ' '.join(query.replace(',', ' ').split())
    if not normalized:
        return normalized

    alias = MYANMAR_LOCATION_ALIASES.get(normalized.lower())
    if alias:
        return alias

    lowered = normalized.lower()
    for suffix in (' township', ' district', ' region', ' state', ' city'):
        if lowered.endswith(suffix):
            normalized = normalized[: -len(suffix)].strip()
            break

    return normalized


def build_alert(location: str, crop: str, weather: WeatherSnapshot, source: str) -> Alert:
    rainfall = weather.rainfall_mm_next_3_days
    temp = weather.max_temperature_c_next_3_days
    moisture = weather.avg_soil_moisture_pct
    wind = weather.max_wind_kph_next_3_days

    if rainfall >= 90 and moisture >= 35:
        risk = 'High Flood Risk'
        confidence = min(96, int(60 + rainfall / 4 + max(moisture - 30, 0)))
        timing = 'Next 72 hours'
        advice = 'Move inputs to higher ground, clear drainage channels, and delay field work until runoff eases.'
    elif rainfall <= 15 and temp >= 35 and moisture <= 20:
        risk = 'High Drought Risk'
        confidence = min(94, int(56 + temp + max(20 - moisture, 0) + max(15 - rainfall, 0) / 2))
        timing = 'Next 72 hours'
        advice = 'Prepare irrigation, mulch exposed soil, and reduce transplanting or fertilizer application during peak heat.'
    elif wind >= 45 or rainfall >= 70:
        risk = 'Storm Warning'
        confidence = min(93, int(58 + wind / 1.8 + rainfall / 8))
        timing = 'Next 48 hours'
        advice = 'Secure seedlings, avoid spraying or fertilizer application, and protect stored harvest from gusts and heavy showers.'
    else:
        risk = 'Moderate Climate Risk'
        confidence = min(84, int(62 + rainfall / 12 + wind / 12))
        timing = 'Next 5 days'
        advice = 'Keep monitoring the forecast, maintain field drainage, and prepare basic crop protection for changing conditions.'

    sms = _build_sms(location, crop, risk, advice, weather)

    return Alert(
        location=location,
        crop=crop,
        risk=risk,
        confidence=confidence,
        timing=timing,
        advice=advice,
        sms=sms,
        source=source,
        weather=weather,
    )


@app.get('/')
def root():
    return {'message': 'Climate Risk Prediction API is running'}


@app.get('/health')
def health():
    return {'status': 'ok'}


def _fetch_json_blocking(url: str, params: dict) -> dict:
    query_string = urlencode(params)
    request = Request(
        f'{url}?{query_string}',
        headers={
            'User-Agent': 'climate-risk-prototype/1.0',
            'Accept': 'application/json',
        },
    )
    with urlopen(request, timeout=12) as response:
        return json.loads(response.read().decode('utf-8'))


async def fetch_json(url: str, params: dict) -> dict:
    try:
        return await asyncio.to_thread(_fetch_json_blocking, url, params)
    except HTTPError as exc:
        raise HTTPException(status_code=502, detail=f'Weather provider returned HTTP {exc.code}.') from exc
    except URLError as exc:
        reason = getattr(exc, 'reason', exc)
        raise HTTPException(status_code=502, detail=f'Weather provider connection failed: {reason}') from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail='Weather provider timed out.') from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'Weather provider request failed: {exc}') from exc


async def geocode_location(query: str) -> dict:
    normalized_query = _normalize_myanmar_query(query)
    cache_key = normalized_query.lower()
    cached_match = GEOCODE_CACHE.get(cache_key)
    if cached_match:
        return cached_match

    search_terms = [normalized_query]
    if normalized_query and 'myanmar' not in normalized_query.lower():
        search_terms.append(f'{normalized_query}, Myanmar')

    for search_term in search_terms:
        payload = await fetch_json(
            GEOCODING_API_URL,
            {
                'name': search_term,
                'count': 5,
                'language': 'en',
                'format': 'json',
                'countryCode': 'MM',
            },
        )
        results = payload.get('results') or []
        if results:
            GEOCODE_CACHE[cache_key] = results[0]
            return results[0]

    raise HTTPException(status_code=404, detail=f'Could not find a Myanmar location matching "{query}".')


async def fetch_weather_snapshot(latitude: float, longitude: float) -> WeatherSnapshot:
    payload = await fetch_json(
        FORECAST_API_URL,
        {
            'latitude': latitude,
            'longitude': longitude,
            'timezone': 'auto',
            'forecast_days': 3,
            'current': 'temperature_2m,relative_humidity_2m',
            'daily': 'precipitation_sum,temperature_2m_max,wind_speed_10m_max',
            'hourly': 'soil_moisture_0_to_1cm',
        },
    )

    current = payload.get('current') or {}
    daily = payload.get('daily') or {}
    hourly = payload.get('hourly') or {}

    precipitation_values = [float(value) for value in (daily.get('precipitation_sum') or [])[:3] if value is not None]
    temperature_values = [float(value) for value in (daily.get('temperature_2m_max') or [])[:3] if value is not None]
    wind_values = [float(value) for value in (daily.get('wind_speed_10m_max') or [])[:3] if value is not None]
    soil_values = [float(value) for value in (hourly.get('soil_moisture_0_to_1cm') or [])[:72] if value is not None]

    if not precipitation_values or not temperature_values or not wind_values:
        raise HTTPException(status_code=502, detail='Weather forecast API returned incomplete data.')

    current_humidity = int(round(float(current.get('relative_humidity_2m', 65))))
    soil_moisture_pct = round(_mean(soil_values) * 100, 1) if soil_values else round(current_humidity * 0.6, 1)

    return WeatherSnapshot(
        current_temperature_c=round(float(current.get('temperature_2m', max(temperature_values))), 1),
        current_humidity_pct=current_humidity,
        rainfall_mm_next_3_days=round(sum(precipitation_values), 1),
        max_temperature_c_next_3_days=round(max(temperature_values), 1),
        max_wind_kph_next_3_days=round(max(wind_values), 1),
        avg_soil_moisture_pct=soil_moisture_pct,
        latitude=round(latitude, 4),
        longitude=round(longitude, 4),
        timezone=payload.get('timezone'),
        forecast_time=current.get('time'),
    )


async def build_live_alert(request: PredictRequest) -> Alert:
    if request.latitude is not None and request.longitude is not None:
        resolved_location = _normalize_myanmar_query(request.location)
        weather = await fetch_weather_snapshot(latitude=request.latitude, longitude=request.longitude)
    else:
        location_match = await geocode_location(request.location)
        resolved_location = _format_location_name(location_match)
        weather = await fetch_weather_snapshot(
            latitude=float(location_match['latitude']),
            longitude=float(location_match['longitude']),
        )

    return build_alert(
        location=resolved_location,
        crop=request.crop,
        weather=weather,
        source='Open-Meteo live forecast',
    )


async def build_watchlist_alert(item: dict[str, str]) -> Alert | None:
    try:
        alert = await build_live_alert(
            PredictRequest(location=item['query'], crop=item['crop']),
        )
    except HTTPException:
        return None

    display_location = f"{item['label']}, {item['region']}"
    return Alert(
        location=display_location,
        crop=alert.crop,
        risk=alert.risk,
        confidence=alert.confidence,
        timing=alert.timing,
        advice=alert.advice,
        sms=_build_sms(display_location, alert.crop, alert.risk, alert.advice, alert.weather),
        source=alert.source,
        weather=alert.weather,
    )


async def get_watchlist_alerts() -> List[Alert]:
    cached_alerts = WATCHLIST_CACHE.get('alerts') or []
    cached_at = float(WATCHLIST_CACHE.get('timestamp') or 0.0)
    if cached_alerts and time.monotonic() - cached_at < NOTIFICATION_CACHE_TTL_SECONDS:
        return cached_alerts

    results = await asyncio.gather(
        *(build_watchlist_alert(item) for item in WATCHLIST_ITEMS),
    )

    alerts = [result for result in results if result is not None]

    if alerts:
        WATCHLIST_CACHE['timestamp'] = time.monotonic()
        WATCHLIST_CACHE['alerts'] = alerts
        return alerts

    if cached_alerts:
        return cached_alerts

    raise HTTPException(status_code=502, detail='Could not load live Myanmar watchlist from weather services.')


@app.get('/sample-alerts', response_model=BatchResponse)
async def sample_alerts():
    results = await asyncio.gather(
        *(build_watchlist_alert(item) for item in SAMPLE_ALERT_ITEMS),
    )
    alerts = [result for result in results if result is not None]
    if not alerts:
        raise HTTPException(status_code=502, detail='Could not load sample Myanmar alerts from weather services.')
    return {'alerts': alerts}


@app.get('/live-notifications', response_model=BatchResponse)
async def live_notifications():
    alerts = await get_watchlist_alerts()
    return {'alerts': alerts}


@app.post('/predict', response_model=Alert)
async def predict(request: PredictRequest):
    return await build_live_alert(request)
