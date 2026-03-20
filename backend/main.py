import asyncio
import os
from functools import lru_cache
from typing import List

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title='Climate Risk Prediction API', version='0.1.0')

GEOCODING_API_URL = 'https://geocoding-api.open-meteo.com/v1/search'
FORECAST_API_URL = 'https://api.open-meteo.com/v1/forecast'


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


async def geocode_location(client: httpx.AsyncClient, query: str) -> dict:
    response = await client.get(
        GEOCODING_API_URL,
        params={
            'name': query,
            'count': 1,
            'language': 'en',
            'format': 'json',
        },
    )
    response.raise_for_status()
    payload = response.json()
    results = payload.get('results') or []

    if not results:
        raise HTTPException(status_code=404, detail=f'Could not find a location matching "{query}".')

    return results[0]


async def fetch_weather_snapshot(client: httpx.AsyncClient, latitude: float, longitude: float) -> WeatherSnapshot:
    response = await client.get(
        FORECAST_API_URL,
        params={
            'latitude': latitude,
            'longitude': longitude,
            'timezone': 'auto',
            'forecast_days': 3,
            'current': 'temperature_2m,relative_humidity_2m',
            'daily': 'precipitation_sum,temperature_2m_max,wind_speed_10m_max',
            'hourly': 'soil_moisture_0_to_1cm',
        },
    )
    response.raise_for_status()
    payload = response.json()

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


def build_demo_snapshot(data: PredictRequest) -> WeatherSnapshot:
    rainfall = float(data.rainfall_mm_next_3_days or 45)
    temperature = float(data.temperature_c or 31)
    soil_moisture = float(data.soil_moisture_pct or 30)
    wind = float(data.wind_kph or 22)

    return WeatherSnapshot(
        current_temperature_c=round(temperature - 1, 1),
        current_humidity_pct=max(20, min(95, int(round(soil_moisture * 1.8)))),
        rainfall_mm_next_3_days=round(rainfall, 1),
        max_temperature_c_next_3_days=round(temperature, 1),
        max_wind_kph_next_3_days=round(wind, 1),
        avg_soil_moisture_pct=round(soil_moisture, 1),
    )


async def build_live_alert(client: httpx.AsyncClient, request: PredictRequest) -> Alert:
    location_match = await geocode_location(client, request.location)
    resolved_location = _format_location_name(location_match)
    weather = await fetch_weather_snapshot(
        client,
        latitude=float(location_match['latitude']),
        longitude=float(location_match['longitude']),
    )
    return build_alert(
        location=resolved_location,
        crop=request.crop,
        weather=weather,
        source='Open-Meteo live forecast',
    )


@app.get('/sample-alerts', response_model=BatchResponse)
async def sample_alerts():
    sample_requests = [
        PredictRequest(location='Hlegu', crop='Rice', rainfall_mm_next_3_days=110, temperature_c=31, soil_moisture_pct=42, wind_kph=24),
        PredictRequest(location='Magway', crop='Sesame', rainfall_mm_next_3_days=8, temperature_c=39, soil_moisture_pct=16, wind_kph=18),
        PredictRequest(location='Bago', crop='Pulses', rainfall_mm_next_3_days=82, temperature_c=30, soil_moisture_pct=28, wind_kph=49),
    ]

    async with httpx.AsyncClient(timeout=10.0) as client:
        results = await asyncio.gather(
            *(build_live_alert(client, request) for request in sample_requests),
            return_exceptions=True,
        )

    alerts = []
    for request, result in zip(sample_requests, results):
        if isinstance(result, Exception):
            alerts.append(
                build_alert(
                    location=request.location,
                    crop=request.crop,
                    weather=build_demo_snapshot(request),
                    source='Demo weather profile',
                )
            )
        else:
            alerts.append(result)

    return {'alerts': alerts}


@app.post('/predict', response_model=Alert)
async def predict(request: PredictRequest):
    manual_metrics_present = all(
        value is not None
        for value in [
            request.rainfall_mm_next_3_days,
            request.temperature_c,
            request.soil_moisture_pct,
            request.wind_kph,
        ]
    )

    if manual_metrics_present:
        return build_alert(
            location=request.location,
            crop=request.crop,
            weather=build_demo_snapshot(request),
            source='Manual climate inputs',
        )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            return await build_live_alert(client, request)
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail='Failed to fetch live weather data.') from exc
