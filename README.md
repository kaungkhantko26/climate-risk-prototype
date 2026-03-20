# Climate Risk Prediction System Prototype

This is a hackathon-ready prototype with:
- **FastAPI backend** for climate risk prediction
- **React + Vite frontend** for the farmer dashboard
- **Simple rule-based logic** for flood, drought, and storm alerts
- **SMS-ready alert output** for low-connectivity scenarios

## Folder structure

- `backend/main.py` - prediction API
- `backend/requirements.txt` - backend dependencies
- `frontend/src/App.jsx` - dashboard UI
- `frontend/package.json` - frontend dependencies

## How it works

The frontend sends weather inputs to the backend `/predict` endpoint.
The backend applies simple logic:
- high rainfall + high soil moisture -> flood risk
- very low rainfall + high temperature -> drought risk
- high wind or heavy rain -> storm warning

Then it returns:
- risk level
- confidence score
- timing window
- farmer advice
- SMS message

## Run locally

### 1) Start backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### 2) Start frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Then open the local Vite URL in your browser.

## Demo script

1. Open the dashboard and show the sample alerts.
2. Explain that the alerts come from the prediction API.
3. Change rainfall / temperature / soil moisture values.
4. Click **Generate Prediction**.
5. Show the updated alert and SMS preview.
6. Conclude with how this supports smallholder farmers with low-connectivity delivery.

## Next upgrades

- Replace rule logic with a trained ML model
- Add real weather API ingestion
- Add Burmese language support
- Add crop-specific recommendations
- Add district-level map view
