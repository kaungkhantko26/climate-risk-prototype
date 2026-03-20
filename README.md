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

The frontend will call `http://127.0.0.1:8000` automatically in local development.

## GitHub Pages deploy

This repo includes a GitHub Actions workflow at `.github/workflows/deploy.yml` that deploys the `frontend/` app to GitHub Pages on every push to `main`.

The production deploy is configured for the custom domain `climate-risk-prototype.kaungkhantko.top`.

If you only deploy the frontend, the site falls back to built-in demo alerts and prediction logic so the Pages version still works without a live backend.

If you deploy the FastAPI backend somewhere else, add a GitHub repository variable named `VITE_API_BASE_URL` with your backend URL and the Pages build will use it.

## Backend deploy from GitHub

GitHub Pages cannot run Python or FastAPI. GitHub's current Pages docs describe Pages as a static hosting service and explicitly note that GitHub Pages does not support server-side languages such as Python:
- https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- https://docs.github.com/enterprise-cloud@latest/pages/getting-started-with-github-pages/creating-a-github-pages-site

This repo now includes:
- `backend/Dockerfile` for container-based deployment
- `render.yaml` for deploying the FastAPI backend directly from this GitHub repo on Render
- `ALLOWED_ORIGINS` support in `backend/main.py` for the local frontend and `https://climate-risk-prototype.kaungkhantko.top`

To use the live backend with the GitHub Pages frontend:

1. Deploy the `backend/` service from this GitHub repo using Render or another Python host.
2. Copy the deployed API URL, for example `https://your-api.onrender.com`.
3. In GitHub, open this repo's `Settings > Secrets and variables > Actions > Variables`.
4. Add `VITE_API_BASE_URL` with your deployed backend URL.
5. Re-run the Pages workflow or push a new commit so the frontend rebuild picks up the API URL.

The backend includes a health endpoint at `/health` for deployment checks.

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
