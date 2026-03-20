from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI(title='Climate Risk Prediction API', version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

class PredictRequest(BaseModel):
    location: str
    crop: str
    rainfall_mm_next_3_days: float
    temperature_c: float
    soil_moisture_pct: float
    wind_kph: float

class Alert(BaseModel):
    location: str
    crop: str
    risk: str
    confidence: int
    timing: str
    advice: str
    sms: str

class BatchResponse(BaseModel):
    alerts: List[Alert]


def predict_risk(data: PredictRequest) -> Alert:
    rainfall = data.rainfall_mm_next_3_days
    temp = data.temperature_c
    moisture = data.soil_moisture_pct
    wind = data.wind_kph

    if rainfall >= 140 and moisture >= 70:
        risk = 'High Flood Risk'
        confidence = min(95, int(65 + rainfall / 5))
        timing = 'Next 72 hours'
        advice = 'Delay planting and move fertilizer or tools to higher ground.'
    elif rainfall <= 20 and temp >= 36:
        risk = 'High Drought Risk'
        confidence = min(92, int(60 + temp))
        timing = 'Next 7-10 days'
        advice = 'Prepare irrigation, mulch soil, and reduce non-essential water use.'
    elif wind >= 45 or rainfall >= 90:
        risk = 'Storm Warning'
        confidence = min(90, int(58 + wind / 2))
        timing = 'Next 48 hours'
        advice = 'Secure seedlings, avoid fertilizer application, and protect stored harvest.'
    else:
        risk = 'Moderate Climate Risk'
        confidence = 68
        timing = 'Next 5 days'
        advice = 'Continue monitoring conditions and prepare basic protective measures.'

    sms = (
        f'{risk} in {data.location} for {data.crop}. {advice} '
        f'Forecast window: {timing}.'
    )

    return Alert(
        location=data.location,
        crop=data.crop,
        risk=risk,
        confidence=confidence,
        timing=timing,
        advice=advice,
        sms=sms,
    )


@app.get('/')
def root():
    return {'message': 'Climate Risk Prediction API is running'}


@app.get('/sample-alerts', response_model=BatchResponse)
def sample_alerts():
    samples = [
        PredictRequest(location='Hlegu', crop='Rice', rainfall_mm_next_3_days=180, temperature_c=31, soil_moisture_pct=84, wind_kph=18),
        PredictRequest(location='Magway', crop='Sesame', rainfall_mm_next_3_days=12, temperature_c=39, soil_moisture_pct=21, wind_kph=14),
        PredictRequest(location='Bago', crop='Pulses', rainfall_mm_next_3_days=95, temperature_c=30, soil_moisture_pct=65, wind_kph=52),
    ]
    return {'alerts': [predict_risk(item) for item in samples]}


@app.post('/predict', response_model=Alert)
def predict(request: PredictRequest):
    return predict_risk(request)
