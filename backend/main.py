import asyncio
import json
import logging
import os
import random
import re
import time
from datetime import datetime, timezone
from functools import lru_cache
from typing import List
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request as UrlRequest, urlopen

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pywebpush import WebPushException, webpush

app = FastAPI(title='Climate Risk Prediction API', version='0.1.0')
logger = logging.getLogger('climate-risk-api')

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
BACKGROUND_TEMPERATURE_CHANGE_C = 1.5
BACKGROUND_GREETING_INTERVAL_SECONDS = 300


def _build_yangon_township_items() -> list[dict[str, object]]:
    # Each township entry: (label, geocode_query, latitude, longitude)
    TownshipEntry = tuple[str, str, float, float]

    def district_items(
        district_group: str,
        products: list[str],
        townships: list[TownshipEntry],
    ) -> list[dict[str, object]]:
        return [
            {
                'label': label,
                'query': query,
                'region': 'Yangon Region',
                'district_group': district_group,
                'menu_group': f'Yangon Region • {district_group}',
                'products': products,
                'latitude': lat,
                'longitude': lon,
            }
            for label, query, lat, lon in townships
        ]

    return [
        *district_items(
            'Western Yangon District',
            ['Rice', 'Vegetables', 'Fishery'],
            [
                ('Kamaryut Township', 'Kamayut Township, Yangon, Myanmar', 16.843, 96.127),
                ('Kyauktada Township', 'Kyauktada Township, Yangon, Myanmar', 16.776, 96.160),
                ('Kyimyindine Township', 'Kyeemyindaing Township, Yangon, Myanmar', 16.806, 96.131),
                ('Sangyoung Township', 'Sanchaung Township, Yangon, Myanmar', 16.841, 96.143),
                ('Seikkan Township', 'Seikkan Township, Yangon, Myanmar', 16.802, 96.216),
                ('Dagon Township', 'Dagon Township, Yangon, Myanmar', 16.793, 96.165),
                ('Pabedann Township', 'Pabedan Township, Yangon, Myanmar', 16.787, 96.153),
                ('Bahann Township', 'Bahan Township, Yangon, Myanmar', 16.830, 96.152),
                ('Mayangonn Township', 'Mayangon Township, Yangon, Myanmar', 16.874, 96.140),
                ('Latha Township', 'Latha Township, Yangon, Myanmar', 16.783, 96.147),
                ('Hline Township', 'Hlaing Township, Yangon, Myanmar', 16.848, 96.104),
                ('Lanmadaw Township', 'Lanmadaw Township, Yangon, Myanmar', 16.779, 96.140),
                ('Alone Township', 'Ahlone Township, Yangon, Myanmar', 16.796, 96.139),
            ],
        ),
        *district_items(
            'Southern Yangon District',
            ['Rice', 'Fishery', 'Coconut'],
            [
                ('Kawhmu Township', 'Kawhmu Township, Yangon, Myanmar', 16.741, 95.981),
                ('Kyauktan Township', 'Kyauktan Township, Yangon, Myanmar', 16.641, 96.354),
                ('Kungyangonn Township', 'Kungyangon Township, Yangon, Myanmar', 16.547, 96.146),
                ('Kayan Township', 'Kayan Township, Yangon, Myanmar', 16.891, 96.267),
                ('Seikkyi/Khanaungto Township', 'Seikkyi Kanaungto Township, Yangon, Myanmar', 16.678, 96.052),
                ('Twantay Township', 'Twante Township, Yangon, Myanmar', 16.712, 95.949),
                ('Dalla Township', 'Dala Township, Yangon, Myanmar', 16.745, 96.138),
                ('Thongwa Township', 'Thongwa Township, Yangon, Myanmar', 16.759, 96.523),
                ('Tanyin Township', 'Thanlyin Township, Yangon, Myanmar', 16.748, 96.249),
            ],
        ),
        *district_items(
            'Northern Yangon District',
            ['Rice', 'Vegetables', 'Fishery'],
            [
                ('Taikkyi Township', 'Taikkyi Township, Yangon, Myanmar', 17.381, 95.963),
                ('Htantabin Township', 'Htantabin Township, Yangon, Myanmar', 17.238, 96.050),
                ('Shwepyitha Township', 'Shwepyitha Township, Yangon, Myanmar', 16.947, 96.091),
                ('Hlinethaya Township', 'Hlaingthaya Township, Yangon, Myanmar', 16.939, 96.055),
                ('Hlegu Township', 'Hlegu Township, Yangon, Myanmar', 17.118, 96.256),
                ('Insein Township', 'Insein Township, Yangon, Myanmar', 16.940, 96.123),
                ('Mingaladon Township', 'Mingaladon Township, Yangon, Myanmar', 16.991, 96.115),
                ('Hmawby Township', 'Hmawbi Township, Yangon, Myanmar', 17.101, 96.084),
            ],
        ),
        *district_items(
            'Eastern Yangon District',
            ['Rice', 'Vegetables', 'Fishery'],
            [
                ('Tarmwe Township', 'Tamwe Township, Yangon, Myanmar', 16.847, 96.186),
                ('South Okkalapa Township', 'South Okkalapa Township, Yangon, Myanmar', 16.861, 96.200),
                ('Dagon Myothit (South) Township', 'Dagon Myothit South Township, Yangon, Myanmar', 16.871, 96.245),
                ('Dawbon Township', 'Dawbon Township, Yangon, Myanmar', 16.804, 96.183),
                ('Pazundaung Township', 'Pazundaung Township, Yangon, Myanmar', 16.795, 96.170),
                ('Botahtaung Township', 'Botataung Township, Yangon, Myanmar', 16.779, 96.172),
                ('Mingalataungnyunt Township', 'Mingala Taungnyunt Township, Yangon, Myanmar', 16.820, 96.181),
                ('North Okkalapa Township', 'North Okkalapa Township, Yangon, Myanmar', 16.890, 96.198),
                ('Yankin Township', 'Yankin Township, Yangon, Myanmar', 16.838, 96.166),
                ('Tharkayta Township', 'Thaketa Township, Yangon, Myanmar', 16.817, 96.203),
                ('Thingangyunn Township', 'Thingangyun Township, Yangon, Myanmar', 16.861, 96.173),
                ('Dagon Myothit (North) Township', 'Dagon Myothit North Township, Yangon, Myanmar', 16.904, 96.219),
            ],
        ),
    ]


SAMPLE_ALERT_ITEMS = [
    {'label': 'Hlegu', 'query': 'Hlegu', 'region': 'Yangon Region', 'products': ['Rice', 'Vegetables', 'Fishery'], 'latitude': 17.118, 'longitude': 96.256},
    {'label': 'Magway', 'query': 'Magway', 'region': 'Magway Region', 'products': ['Sesame', 'Beans', 'Groundnut'], 'latitude': 20.150, 'longitude': 94.930},
    {'label': 'Bago', 'query': 'Bago', 'region': 'Bago Region', 'products': ['Rice', 'Beans', 'Sugarcane'], 'latitude': 17.338, 'longitude': 96.480},
]
YANGON_DISTRICT_WATCHLIST_ITEMS = [
    {'label': 'Yangon East', 'query': 'East Yangon District', 'region': 'Yangon Region', 'products': ['Rice', 'Vegetables', 'Fishery'], 'latitude': 16.852, 'longitude': 96.186},
    {'label': 'Yangon West', 'query': 'West Yangon District', 'region': 'Yangon Region', 'products': ['Rice', 'Vegetables', 'Fishery'], 'latitude': 16.857, 'longitude': 96.107},
    {'label': 'Yangon North', 'query': 'North Yangon District', 'region': 'Yangon Region', 'products': ['Rice', 'Vegetables', 'Fishery'], 'latitude': 16.945, 'longitude': 96.115},
    {'label': 'Yangon South', 'query': 'South Yangon District', 'region': 'Yangon Region', 'products': ['Rice', 'Fishery', 'Coconut'], 'latitude': 16.748, 'longitude': 96.249},
]
NON_YANGON_WATCHLIST_ITEMS = [
    {'label': 'Pathein', 'query': 'Pathein', 'region': 'Ayeyarwady Region', 'products': ['Rice', 'Pulses', 'Coconut', 'Fish'], 'latitude': 16.779, 'longitude': 94.733},
    {'label': 'Myaungmya', 'query': 'Myaungmya', 'region': 'Ayeyarwady Region', 'products': ['Rice', 'Fish', 'Coconut'], 'latitude': 16.597, 'longitude': 94.930},
    {'label': 'Hinthada', 'query': 'Hinthada', 'region': 'Ayeyarwady Region', 'products': ['Rice', 'Beans', 'Jute'], 'latitude': 17.641, 'longitude': 95.459},
    {'label': 'Maubin', 'query': 'Maubin', 'region': 'Ayeyarwady Region', 'products': ['Rice', 'Fish', 'Vegetables'], 'latitude': 16.735, 'longitude': 95.653},
    {'label': 'Pyapon', 'query': 'Pyapon', 'region': 'Ayeyarwady Region', 'products': ['Rice', 'Fish', 'Shrimp'], 'latitude': 16.283, 'longitude': 95.683},
    {'label': 'Labutta', 'query': 'Labutta', 'region': 'Ayeyarwady Region', 'products': ['Rice', 'Fish', 'Coconut'], 'latitude': 16.149, 'longitude': 94.748},
    {'label': 'Bago', 'query': 'Bago', 'region': 'Bago Region', 'products': ['Rice', 'Beans', 'Sugarcane'], 'latitude': 17.338, 'longitude': 96.480},
    {'label': 'Taungoo', 'query': 'Taungoo', 'region': 'Bago Region', 'products': ['Rice', 'Rubber', 'Betel Nut'], 'latitude': 18.934, 'longitude': 96.430},
    {'label': 'Pyay', 'query': 'Pyay', 'region': 'Bago Region', 'products': ['Rice', 'Beans', 'Sesame'], 'latitude': 18.818, 'longitude': 95.220},
    {'label': 'Tharrawaddy', 'query': 'Tharrawaddy', 'region': 'Bago Region', 'products': ['Rice', 'Beans', 'Vegetables'], 'latitude': 17.643, 'longitude': 95.795},
    {'label': 'Mandalay', 'query': 'Mandalay', 'region': 'Mandalay Region', 'products': ['Beans', 'Sesame', 'Cotton'], 'latitude': 21.974, 'longitude': 96.083},
    {'label': 'Kyaukse', 'query': 'Kyaukse', 'region': 'Mandalay Region', 'products': ['Rice', 'Onion', 'Garlic'], 'latitude': 21.610, 'longitude': 96.136},
    {'label': 'Meiktila', 'query': 'Meiktila', 'region': 'Mandalay Region', 'products': ['Beans', 'Sesame', 'Groundnut'], 'latitude': 20.873, 'longitude': 95.850},
    {'label': 'Myingyan', 'query': 'Myingyan', 'region': 'Mandalay Region', 'products': ['Beans', 'Sesame', 'Cotton'], 'latitude': 21.459, 'longitude': 95.381},
    {'label': 'Nyaung-U', 'query': 'Nyaung-U', 'region': 'Mandalay Region', 'products': ['Sesame', 'Groundnut', 'Palm Products'], 'latitude': 21.174, 'longitude': 94.930},
    {'label': 'Yamethin', 'query': 'Yamethin', 'region': 'Mandalay Region', 'products': ['Beans', 'Sunflower', 'Rice'], 'latitude': 20.432, 'longitude': 96.143},
    {'label': 'Pyin Oo Lwin', 'query': 'Pyin Oo Lwin', 'region': 'Mandalay Region', 'products': ['Vegetables', 'Coffee', 'Fruits'], 'latitude': 22.028, 'longitude': 96.470},
    {'label': 'Magway', 'query': 'Magway', 'region': 'Magway Region', 'products': ['Sesame', 'Beans', 'Groundnut'], 'latitude': 20.150, 'longitude': 94.930},
    {'label': 'Minbu', 'query': 'Minbu', 'region': 'Magway Region', 'products': ['Sesame', 'Groundnut', 'Sunflower'], 'latitude': 20.182, 'longitude': 94.879},
    {'label': 'Thayet', 'query': 'Thayet', 'region': 'Magway Region', 'products': ['Rice', 'Beans', 'Sugarcane'], 'latitude': 19.437, 'longitude': 94.949},
    {'label': 'Pakokku', 'query': 'Pakokku', 'region': 'Magway Region', 'products': ['Sesame', 'Beans', 'Tobacco'], 'latitude': 21.334, 'longitude': 95.078},
    {'label': 'Gangaw', 'query': 'Gangaw', 'region': 'Magway Region', 'products': ['Rice', 'Beans', 'Maize'], 'latitude': 22.172, 'longitude': 94.138},
    {'label': 'Sagaing', 'query': 'Sagaing', 'region': 'Sagaing Region', 'products': ['Rice', 'Beans', 'Sesame'], 'latitude': 21.879, 'longitude': 95.981},
    {'label': 'Shwebo', 'query': 'Shwebo', 'region': 'Sagaing Region', 'products': ['Rice', 'Beans', 'Sesame'], 'latitude': 22.567, 'longitude': 95.703},
    {'label': 'Monywa', 'query': 'Monywa', 'region': 'Sagaing Region', 'products': ['Beans', 'Sesame', 'Cotton'], 'latitude': 22.118, 'longitude': 95.128},
    {'label': 'Katha', 'query': 'Katha', 'region': 'Sagaing Region', 'products': ['Rice', 'Sugarcane', 'Timber'], 'latitude': 24.183, 'longitude': 96.331},
    {'label': 'Kale', 'query': 'Kale', 'region': 'Sagaing Region', 'products': ['Rice', 'Maize', 'Beans'], 'latitude': 23.193, 'longitude': 94.078},
    {'label': 'Tamu', 'query': 'Tamu', 'region': 'Sagaing Region', 'products': ['Rice', 'Maize', 'Fruits'], 'latitude': 23.211, 'longitude': 94.257},
    {'label': 'Mawlaik', 'query': 'Mawlaik', 'region': 'Sagaing Region', 'products': ['Rice', 'Beans', 'Forest Products'], 'latitude': 23.633, 'longitude': 94.412},
    {'label': 'Hkamti', 'query': 'Hkamti', 'region': 'Sagaing Region', 'products': ['Rice', 'Sugarcane', 'Vegetables'], 'latitude': 25.990, 'longitude': 95.682},
    {'label': 'Dawei', 'query': 'Dawei', 'region': 'Tanintharyi Region', 'products': ['Rubber', 'Betel Nut', 'Coconut'], 'latitude': 14.097, 'longitude': 98.203},
    {'label': 'Myeik', 'query': 'Myeik', 'region': 'Tanintharyi Region', 'products': ['Rubber', 'Oil Palm', 'Fishery'], 'latitude': 12.437, 'longitude': 98.600},
    {'label': 'Kawthaung', 'query': 'Kawthaung', 'region': 'Tanintharyi Region', 'products': ['Rubber', 'Oil Palm', 'Coconut'], 'latitude': 10.024, 'longitude': 98.549},
    {'label': 'Myitkyina', 'query': 'Myitkyina', 'region': 'Kachin State', 'products': ['Rice', 'Sugarcane', 'Fruits'], 'latitude': 25.381, 'longitude': 97.393},
    {'label': 'Bhamo', 'query': 'Bhamo', 'region': 'Kachin State', 'products': ['Rice', 'Corn', 'Fruits'], 'latitude': 24.271, 'longitude': 97.240},
    {'label': 'Mohnyin', 'query': 'Mohnyin', 'region': 'Kachin State', 'products': ['Rice', 'Sugarcane', 'Rubber'], 'latitude': 24.773, 'longitude': 96.383},
    {'label': 'Putao', 'query': 'Putao', 'region': 'Kachin State', 'products': ['Rice', 'Fruits', 'Vegetables'], 'latitude': 27.328, 'longitude': 97.430},
    {'label': 'Loikaw', 'query': 'Loikaw', 'region': 'Kayah State', 'products': ['Rice', 'Maize', 'Sesame'], 'latitude': 19.684, 'longitude': 97.210},
    {'label': 'Bawlakhe', 'query': 'Bawlakhe', 'region': 'Kayah State', 'products': ['Rice', 'Maize', 'Beans'], 'latitude': 19.167, 'longitude': 97.200},
    {'label': 'Hpa-An', 'query': 'Hpa-An', 'region': 'Kayin State', 'products': ['Rice', 'Rubber', 'Betel Nut'], 'latitude': 16.878, 'longitude': 97.632},
    {'label': 'Myawaddy', 'query': 'Myawaddy', 'region': 'Kayin State', 'products': ['Rubber', 'Corn', 'Trade Crops'], 'latitude': 16.700, 'longitude': 98.508},
    {'label': 'Kawkareik', 'query': 'Kawkareik', 'region': 'Kayin State', 'products': ['Rubber', 'Rice', 'Betel Nut'], 'latitude': 16.543, 'longitude': 98.238},
    {'label': 'Hakha', 'query': 'Hakha', 'region': 'Chin State', 'products': ['Maize', 'Beans', 'Fruits'], 'latitude': 22.645, 'longitude': 93.612},
    {'label': 'Falam', 'query': 'Falam', 'region': 'Chin State', 'products': ['Maize', 'Beans', 'Vegetables'], 'latitude': 22.896, 'longitude': 93.679},
    {'label': 'Mindat', 'query': 'Mindat', 'region': 'Chin State', 'products': ['Maize', 'Coffee', 'Fruits'], 'latitude': 21.375, 'longitude': 93.718},
    {'label': 'Matupi', 'query': 'Matupi', 'region': 'Chin State', 'products': ['Maize', 'Beans', 'Fruits'], 'latitude': 23.021, 'longitude': 93.480},
    {'label': 'Mawlamyine', 'query': 'Mawlamyine', 'region': 'Mon State', 'products': ['Rubber', 'Rice', 'Coconut'], 'latitude': 16.489, 'longitude': 97.627},
    {'label': 'Thaton', 'query': 'Thaton', 'region': 'Mon State', 'products': ['Rubber', 'Betel Nut', 'Rice'], 'latitude': 16.919, 'longitude': 97.378},
    {'label': 'Sittwe', 'query': 'Sittwe', 'region': 'Rakhine State', 'products': ['Rice', 'Fish', 'Coconut'], 'latitude': 20.152, 'longitude': 92.897},
    {'label': 'Thandwe', 'query': 'Thandwe', 'region': 'Rakhine State', 'products': ['Rice', 'Coconut', 'Fish'], 'latitude': 18.458, 'longitude': 94.362},
    {'label': 'Kyaukpyu', 'query': 'Kyaukpyu', 'region': 'Rakhine State', 'products': ['Rice', 'Fish', 'Coconut'], 'latitude': 19.440, 'longitude': 93.550},
    {'label': 'Maungdaw', 'query': 'Maungdaw', 'region': 'Rakhine State', 'products': ['Rice', 'Beans', 'Fish'], 'latitude': 20.827, 'longitude': 92.365},
    {'label': 'Mrauk-U', 'query': 'Mrauk-U', 'region': 'Rakhine State', 'products': ['Rice', 'Vegetables', 'Fish'], 'latitude': 20.586, 'longitude': 93.013},
    {'label': 'Taunggyi', 'query': 'Taunggyi', 'region': 'Shan State', 'products': ['Rice', 'Tea', 'Vegetables'], 'latitude': 20.791, 'longitude': 97.039},
    {'label': 'Lashio', 'query': 'Lashio', 'region': 'Shan State', 'products': ['Rice', 'Corn', 'Fruits'], 'latitude': 22.931, 'longitude': 97.749},
    {'label': 'Kengtung', 'query': 'Kengtung', 'region': 'Shan State', 'products': ['Rice', 'Coffee', 'Tea'], 'latitude': 21.297, 'longitude': 99.602},
    {'label': 'Muse', 'query': 'Muse', 'region': 'Shan State', 'products': ['Corn', 'Fruits', 'Trade Crops'], 'latitude': 23.981, 'longitude': 97.648},
    {'label': 'Loilen', 'query': 'Loilen', 'region': 'Shan State', 'products': ['Rice', 'Tea', 'Fruits'], 'latitude': 20.910, 'longitude': 97.770},
    {'label': 'Langkho', 'query': 'Langkho', 'region': 'Shan State', 'products': ['Rice', 'Corn', 'Sesame'], 'latitude': 21.226, 'longitude': 98.443},
    {'label': 'Mong Hsat', 'query': 'Mong Hsat', 'region': 'Shan State', 'products': ['Rice', 'Maize', 'Fruits'], 'latitude': 20.533, 'longitude': 99.828},
    {'label': 'Mong Ton', 'query': 'Mong Ton', 'region': 'Shan State', 'products': ['Rice', 'Corn', 'Vegetables'], 'latitude': 20.300, 'longitude': 98.847},
    {'label': 'Tachileik', 'query': 'Tachileik', 'region': 'Shan State', 'products': ['Rice', 'Corn', 'Fruits'], 'latitude': 20.444, 'longitude': 99.883},
    {'label': 'Kyaukme', 'query': 'Kyaukme', 'region': 'Shan State', 'products': ['Rice', 'Tea', 'Coffee'], 'latitude': 22.540, 'longitude': 97.030},
]
WATCHLIST_ITEMS = YANGON_DISTRICT_WATCHLIST_ITEMS + NON_YANGON_WATCHLIST_ITEMS
LOCATION_MENU_ITEMS = _build_yangon_township_items() + NON_YANGON_WATCHLIST_ITEMS
BACKGROUND_CUTE_GREETING_MESSAGES = [
    {
        'title': 'သာယာသောနေ့လေးဖြစ်ပါစေ',
        'body': 'Climate Monitor က ဒီနေ့ရဲ့ ရာသီဥတုအပြောင်းအလဲတွေကို ချိုချိုလေး စောင့်ကြည့်ပေးနေပါတယ်။',
    },
    {
        'title': 'မင်္ဂလာပါ တောင်သူလေး',
        'body': 'လက်ရှိအပူချိန်နဲ့ forecast update တွေကို app ထဲမှာ ပြင်ဆင်ထားပြီး စစ်ဆေးနိုင်ပါတယ်။',
    },
    {
        'title': 'နေ့လယ်ခင်းလေးကို အေးအေးချမ်းချမ်းဖြတ်သန်းပါ',
        'body': 'မြို့နယ်အလိုက် temperature feed နဲ့ climate watch ကို Climate Monitor က ဆက်လက်ပြပေးနေပါတယ်။',
    },
    {
        'title': 'Climate Monitor က နှုတ်ဆက်ပါတယ်',
        'body': 'App notification နဲ့ weather watch update တွေကို အချိန်နဲ့တပြေးညီ ပြင်ဆင်ထားပါတယ်။',
    },
]
GEOCODE_CACHE: dict[str, dict] = {}
WATCHLIST_CACHE: dict[str, object] = {'timestamp': 0.0, 'alerts': []}
ADMIN_BROADCAST_STATE: dict[str, dict | None] = {'broadcast': None}


@lru_cache
def get_allowed_origins() -> List[str]:
    raw_origins = os.getenv(
        'ALLOWED_ORIGINS',
        'http://127.0.0.1:5173,http://localhost:5173,https://climate-risk-prototype.kaungkhantko.top',
    )
    return [origin.strip() for origin in raw_origins.split(',') if origin.strip()]


@lru_cache
def get_supabase_url() -> str:
    return os.getenv('SUPABASE_URL', '').rstrip('/')


@lru_cache
def get_supabase_service_role_key() -> str:
    return os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')


@lru_cache
def get_vapid_public_key() -> str:
    return os.getenv('VAPID_PUBLIC_KEY', '')


@lru_cache
def get_vapid_private_key() -> str:
    return os.getenv('VAPID_PRIVATE_KEY', '')


@lru_cache
def get_vapid_subject() -> str:
    return os.getenv('VAPID_SUBJECT', 'mailto:admin@climate-monitor.local')


@lru_cache
def get_background_push_cron_secret() -> str:
    return os.getenv('BACKGROUND_PUSH_CRON_SECRET', '')


@lru_cache
def get_admin_broadcast_token() -> str:
    return os.getenv('ADMIN_BROADCAST_TOKEN', '')
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=False,
    allow_methods=['GET', 'POST'],
    allow_headers=['Content-Type', 'x-admin-token', 'x-cron-secret'],
)


class PredictRequest(BaseModel):
    location: str = Field(min_length=1, max_length=120)
    crop: str = Field(min_length=1, max_length=60)
    rainfall_mm_next_3_days: float | None = Field(default=None, ge=0, le=2000)
    temperature_c: float | None = Field(default=None, ge=-80, le=80)
    soil_moisture_pct: float | None = Field(default=None, ge=0, le=100)
    wind_kph: float | None = Field(default=None, ge=0, le=400)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


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
    region: str | None = None
    district: str | None = None
    products: List[str] = Field(default_factory=list)


class BatchResponse(BaseModel):
    alerts: List[Alert]


class LocationOption(BaseModel):
    region: str
    district: str
    query: str
    district_group: str | None = None
    menu_group: str | None = None
    products: List[str] = Field(default_factory=list)
    latitude: float | None = None
    longitude: float | None = None


class AdminBroadcastRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=500)


class PushChannelPreferences(BaseModel):
    app: bool = True
    temperature: bool = True


class PushSubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=512)
    auth: str = Field(min_length=1, max_length=256)


class PushSubscriptionPayload(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)
    expirationTime: int | None = None
    keys: PushSubscriptionKeys


class PushSubscriptionRequest(BaseModel):
    subscription: PushSubscriptionPayload
    channels: PushChannelPreferences = Field(default_factory=PushChannelPreferences)
    user_agent: str | None = Field(default=None, max_length=500)


class AdminBroadcastMessage(BaseModel):
    id: str
    title: str
    body: str
    created_at: str
    delivered_count: int = 0
    failed_count: int = 0


class AdminBroadcastEnvelope(BaseModel):
    broadcast: AdminBroadcastMessage | None = None


class PushConfigResponse(BaseModel):
    enabled: bool
    public_key: str | None = None


class PushJobResponse(BaseModel):
    status: str = 'ok'
    detail: str | None = None
    app_notifications_sent: int = 0
    temperature_notifications_sent: int = 0
    failures: int = 0
    strongest_temperature_change_c: float | None = None


@app.middleware('http')
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    response.headers.setdefault('X-Frame-Options', 'DENY')
    response.headers.setdefault('Referrer-Policy', 'same-origin')
    response.headers.setdefault('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)')
    response.headers.setdefault('Cache-Control', 'no-store')
    return response


def _mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _require_allowed_browser_origin(request: Request) -> None:
    origin = request.headers.get('origin', '')
    if not origin or origin not in get_allowed_origins():
        raise HTTPException(status_code=403, detail='Origin not allowed.')


def _require_admin_token(request: Request) -> None:
    expected_token = get_admin_broadcast_token()
    if not expected_token:
        raise HTTPException(status_code=503, detail='Admin broadcast token is not configured.')

    incoming_token = request.headers.get('x-admin-token', '')
    if incoming_token != expected_token:
        raise HTTPException(status_code=401, detail='Invalid admin token.')


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


def _find_location_item(query: str) -> dict[str, object] | None:
    normalized_query = ' '.join(str(query).split()).lower()
    for item in LOCATION_MENU_ITEMS:
        item_query = ' '.join(str(item['query']).split()).lower()
        item_label = ' '.join(str(item['label']).split()).lower()
        if normalized_query in {item_query, item_label}:
            return item
    return None


def _format_location_item_display(item: dict[str, object]) -> str:
    parts = [str(item['label'])]
    if item.get('district_group'):
        parts.append(str(item['district_group']))
    parts.append(str(item['region']))
    return ', '.join(parts)


def _clean_geocode_term(term: str) -> str:
    cleaned = re.sub(r'[()/]', ' ', term)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip(' ,')
    return cleaned


def _build_geocode_search_terms(query: str) -> list[str]:
    normalized_query = _normalize_myanmar_query(query)
    query_item = _find_location_item(query)
    search_terms: list[str] = []
    seen_terms: set[str] = set()

    def add_term(term: str | None):
        if not term:
            return
        cleaned = _clean_geocode_term(str(term))
        if not cleaned:
            return
        lowered = cleaned.lower()
        if lowered in seen_terms:
            return
        seen_terms.add(lowered)
        search_terms.append(cleaned)

    add_term(normalized_query)
    if normalized_query and 'myanmar' not in normalized_query.lower():
        add_term(f'{normalized_query}, Myanmar')

    first_segment = normalized_query.split(',')[0].strip() if normalized_query else ''
    if first_segment:
        add_term(first_segment)

    if query_item:
        label = str(query_item['label'])
        region = str(query_item['region'])
        district_group = str(query_item.get('district_group') or '')
        add_term(label)
        add_term(f'{label}, {region}, Myanmar')
        if district_group:
            add_term(f'{label}, {district_group}, {region}, Myanmar')

        short_label = re.sub(r'\bTownship\b', '', label, flags=re.IGNORECASE).strip(' ,')
        if short_label:
            add_term(f'{short_label}, {region}, Myanmar')
            add_term(f'{short_label} Township, {region}, Myanmar')

    if 'yangon' in normalized_query.lower():
        short_first_segment = re.sub(r'\bTownship\b', '', first_segment, flags=re.IGNORECASE).strip(' ,')
        if short_first_segment:
            add_term(f'{short_first_segment}, Yangon, Myanmar')
            add_term(f'{short_first_segment} Township, Yangon, Myanmar')

    return search_terms


def build_alert(location: str, crop: str, weather: WeatherSnapshot, source: str) -> Alert:
    rainfall = weather.rainfall_mm_next_3_days
    temp = weather.max_temperature_c_next_3_days
    moisture = weather.avg_soil_moisture_pct
    wind = weather.max_wind_kph_next_3_days

    if rainfall >= 90 and moisture >= 35:
        risk = 'ရေကြီးနိုင်မှု မြင့်မား'
        confidence = min(96, int(60 + rainfall / 4 + max(moisture - 30, 0)))
        timing = 'Next 72 hours'
        advice = 'စိုက်ခင်းသုံးပစ္စည်းများကို မြင့်သောနေရာသို့ ရွှေ့ပြီး ရေထွက်လမ်းများကို ရှင်းလင်းထားကာ ရေကျသွားသည်အထိ လယ်ယာလုပ်ငန်းကို ခဏရပ်နားပါ။'
    elif rainfall <= 15 and temp >= 35 and moisture <= 20:
        risk = 'မိုးခေါင်နိုင်မှု မြင့်မား'
        confidence = min(94, int(56 + temp + max(20 - moisture, 0) + max(15 - rainfall, 0) / 2))
        timing = 'Next 72 hours'
        advice = 'ရေသွင်းစနစ်ကို အသင့်ပြင်ထားပြီး မြေပြင်ပေါ် mulch ခင်းကာ အပူချိန်အမြင့်ဆုံးအချိန်တွင် ပြောင်းရွှေ့စိုက်ပျိုးခြင်းနှင့် ဓာတ်မြေသြဇာထည့်ခြင်းကို လျှော့ချပါ။'
    elif wind >= 45 or rainfall >= 70:
        risk = 'မိုးသက်လေပြင်း သတိပေးချက်'
        confidence = min(93, int(58 + wind / 1.8 + rainfall / 8))
        timing = 'Next 48 hours'
        advice = 'ပျိုးပင်များကို ခိုင်မာစွာချည်နှောင်ပြီး ဖျန်းဆေးသို့မဟုတ် ဓာတ်မြေသြဇာထည့်ခြင်းကို ရှောင်ကာ သိုလှောင်ထားသည့် ရိတ်သိမ်းသီးနှံကို လေပြင်းနှင့် မိုးသည်းထန်စွာရွာသွန်းမှုမှ ကာကွယ်ပါ။'
    else:
        risk = 'အလယ်အလတ် ရာသီဥတုအန္တရာယ်'
        confidence = min(84, int(62 + rainfall / 12 + wind / 12))
        timing = 'Next 5 days'
        advice = 'မိုးလေဝသခန့်မှန်းချက်ကို ဆက်လက်စောင့်ကြည့်ပြီး ရေထွက်လမ်းများကို ထိန်းသိမ်းကာ ပြောင်းလဲနိုင်သော အခြေအနေများအတွက် အခြေခံသီးနှံကာကွယ်မှုကို ကြိုတင်ပြင်ဆင်ပါ။'

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
    request = UrlRequest(
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
        logger.exception('Weather provider request failed.')
        raise HTTPException(status_code=502, detail='Weather provider request failed.') from exc


def _supabase_request_blocking(
    method: str,
    table: str,
    payload: dict | list | None = None,
    query: dict | None = None,
    prefer: str | None = None,
):
    supabase_url = get_supabase_url()
    service_key = get_supabase_service_role_key()

    if not supabase_url or not service_key:
        raise HTTPException(status_code=503, detail='Supabase push storage is not configured.')

    endpoint = f'{supabase_url}/rest/v1/{table}'
    if query:
        endpoint = f'{endpoint}?{urlencode(query, doseq=True)}'

    headers = {
        'User-Agent': 'climate-risk-prototype/1.0',
        'Accept': 'application/json',
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
        'Content-Type': 'application/json',
    }
    if prefer:
        headers['Prefer'] = prefer

    request_data = json.dumps(payload).encode('utf-8') if payload is not None else None
    request = UrlRequest(endpoint, data=request_data, headers=headers, method=method)
    with urlopen(request, timeout=15) as response:
        raw_body = response.read().decode('utf-8')
        return json.loads(raw_body) if raw_body else None


async def supabase_request(
    method: str,
    table: str,
    payload: dict | list | None = None,
    query: dict | None = None,
    prefer: str | None = None,
):
    try:
        return await asyncio.to_thread(_supabase_request_blocking, method, table, payload, query, prefer)
    except HTTPException:
        raise
    except HTTPError as exc:
        logger.warning('Supabase returned HTTP %s.', exc.code)
        raise HTTPException(status_code=502, detail=f'Supabase returned HTTP {exc.code}.') from exc
    except URLError as exc:
        reason = getattr(exc, 'reason', exc)
        raise HTTPException(status_code=502, detail=f'Supabase connection failed: {reason}') from exc
    except Exception as exc:
        logger.exception('Supabase request failed.')
        raise HTTPException(status_code=502, detail='Supabase request failed.') from exc


async def upsert_push_subscription(record: dict) -> None:
    await supabase_request(
        'POST',
        'push_subscriptions',
        payload=[record],
        query={'on_conflict': 'endpoint'},
        prefer='resolution=merge-duplicates,return=minimal',
    )


async def list_push_subscriptions() -> list[dict]:
    subscriptions = await supabase_request(
        'GET',
        'push_subscriptions',
        query={'select': 'endpoint,p256dh,auth,channels,active'},
    )
    return subscriptions or []


async def deactivate_push_subscription(endpoint: str) -> None:
    await supabase_request(
        'PATCH',
        'push_subscriptions',
        payload={
            'active': False,
            'updated_at': datetime.now(timezone.utc).isoformat(),
        },
        query={'endpoint': f'eq.{endpoint}'},
        prefer='return=minimal',
    )


async def get_notification_state(key: str) -> dict:
    rows = await supabase_request(
        'GET',
        'notification_states',
        query={'select': 'key,payload', 'key': f'eq.{key}'},
    )
    if not rows:
        return {}

    return rows[0].get('payload') or {}


async def save_notification_state(key: str, payload: dict) -> None:
    await supabase_request(
        'POST',
        'notification_states',
        payload=[{
            'key': key,
            'payload': payload,
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }],
        query={'on_conflict': 'key'},
        prefer='resolution=merge-duplicates,return=minimal',
    )


def _channel_enabled(record: dict, channel: str) -> bool:
    channels = record.get('channels') or {}
    if not isinstance(channels, dict):
        return True

    return bool(channels.get(channel, True))


async def get_push_subscriptions_for_channel(channel: str) -> list[dict]:
    subscriptions = await list_push_subscriptions()
    return [
        subscription for subscription in subscriptions
        if subscription.get('active', True) and _channel_enabled(subscription, channel)
    ]


def _send_web_push_blocking(subscription: dict, payload: dict) -> int | None:
    response = webpush(
        subscription_info={
            'endpoint': subscription['endpoint'],
            'keys': {
                'p256dh': subscription['p256dh'],
                'auth': subscription['auth'],
            },
        },
        data=json.dumps(payload),
        vapid_private_key=get_vapid_private_key(),
        vapid_claims={'sub': get_vapid_subject()},
    )
    return getattr(response, 'status_code', None)


async def send_push_notification_to_subscriptions(
    subscriptions: list[dict],
    title: str,
    body: str,
    *,
    tag: str,
    data: dict | None = None,
    renotify: bool = True,
    require_interaction: bool = False,
) -> tuple[int, int]:
    if not get_vapid_private_key() or not get_vapid_public_key():
        raise HTTPException(status_code=503, detail='Web push VAPID keys are not configured.')

    if not subscriptions:
        return 0, 0

    payload = {
        'title': title,
        'body': body,
        'icon': '/icon-192.png?v=20260321',
        'badge': '/icon-192.png?v=20260321',
        'image': '/icon-512.png?v=20260321',
        'tag': tag,
        'data': data or {'path': '/#', 'view': 'home'},
        'renotify': renotify,
        'requireInteraction': require_interaction,
    }

    delivered = 0
    failures = 0

    for subscription in subscriptions:
        try:
            await asyncio.to_thread(_send_web_push_blocking, subscription, payload)
            delivered += 1
        except WebPushException as exc:
            failures += 1
            status_code = getattr(getattr(exc, 'response', None), 'status_code', None)
            if status_code in {404, 410}:
                await deactivate_push_subscription(subscription['endpoint'])
        except Exception:
            failures += 1

    return delivered, failures


async def send_push_notification_to_channel(
    channel: str,
    title: str,
    body: str,
    *,
    tag: str,
    data: dict | None = None,
    renotify: bool = True,
    require_interaction: bool = False,
) -> tuple[int, int]:
    subscriptions = await get_push_subscriptions_for_channel(channel)
    return await send_push_notification_to_subscriptions(
        subscriptions,
        title,
        body,
        tag=tag,
        data=data,
        renotify=renotify,
        require_interaction=require_interaction,
    )


async def geocode_location(query: str) -> dict:
    normalized_query = _normalize_myanmar_query(query)
    cache_key = normalized_query.lower()
    cached_match = GEOCODE_CACHE.get(cache_key)
    if cached_match:
        return cached_match

    search_terms = _build_geocode_search_terms(query)

    for search_term in search_terms:
        payload = await fetch_json(
            GEOCODING_API_URL,
            {
                'name': search_term,
                'count': 10,
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
    location_item = _find_location_item(request.location)

    if request.latitude is not None and request.longitude is not None:
        resolved_location = _format_location_item_display(location_item) if location_item else _normalize_myanmar_query(request.location)
        weather = await fetch_weather_snapshot(latitude=request.latitude, longitude=request.longitude)
    else:
        location_match = await geocode_location(request.location)
        resolved_location = _format_location_item_display(location_item) if location_item else _format_location_name(location_match)
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


async def build_watchlist_alert(item: dict[str, object]) -> Alert | None:
    products = [str(product) for product in item.get('products') or []]
    primary_crop = products[0] if products else 'Rice'

    item_lat = item.get('latitude')
    item_lon = item.get('longitude')

    try:
        alert = await build_live_alert(
            PredictRequest(
                location=str(item['query']),
                crop=primary_crop,
                latitude=float(item_lat) if item_lat is not None else None,
                longitude=float(item_lon) if item_lon is not None else None,
            ),
        )
    except HTTPException:
        return None

    display_parts = [str(item['label'])]
    if item.get('district_group'):
        display_parts.append(str(item['district_group']))
    display_parts.append(str(item['region']))
    display_location = ', '.join(display_parts)
    return Alert(
        location=display_location,
        crop=primary_crop,
        risk=alert.risk,
        confidence=alert.confidence,
        timing=alert.timing,
        advice=alert.advice,
        sms=_build_sms(display_location, primary_crop, alert.risk, alert.advice, alert.weather),
        source=alert.source,
        weather=alert.weather,
        region=str(item['region']),
        district=str(item['label']),
        products=products,
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


def _get_current_admin_broadcast() -> AdminBroadcastMessage | None:
    current_broadcast = ADMIN_BROADCAST_STATE.get('broadcast')
    if not current_broadcast:
        return None

    return AdminBroadcastMessage(**current_broadcast)


def _pick_background_greeting() -> dict:
    return random.choice(BACKGROUND_CUTE_GREETING_MESSAGES)


def _hottest_temperature_copy(alert: Alert) -> dict:
    current_temperature = round(float(alert.weather.current_temperature_c), 1)
    return {
        'title': f'{alert.location} သည် လက်ရှိအပူဆုံးနေရာဖြစ်ပါသည်',
        'body': f'စောင့်ကြည့်နေသည့်နေရာများထဲတွင် {current_temperature}°C ဖြင့် အပူချိန်အမြင့်ဆုံးဖြစ်နေပါသည်။ {alert.crop} စိုက်ခင်းအတွက် ရေသွင်းစနစ်နှင့် အပူကာကွယ်ရေးကို ပြင်ဆင်ပါ။',
    }


async def run_background_push_cycle() -> PushJobResponse:
    app_notifications_sent = 0
    temperature_notifications_sent = 0
    failures = 0
    hottest_temperature = None
    subscriptions = await list_push_subscriptions()
    app_subscriptions = [
        subscription for subscription in subscriptions
        if subscription.get('active', True) and _channel_enabled(subscription, 'app')
    ]
    temperature_subscriptions = [
        subscription for subscription in subscriptions
        if subscription.get('active', True) and _channel_enabled(subscription, 'temperature')
    ]

    if not app_subscriptions and not temperature_subscriptions:
        return PushJobResponse(
            status='ok',
            detail='No active push subscriptions found.',
            app_notifications_sent=0,
            temperature_notifications_sent=0,
            failures=0,
            strongest_temperature_change_c=None,
        )

    if app_subscriptions:
        greeting = _pick_background_greeting()
        delivered, failed = await send_push_notification_to_subscriptions(
            app_subscriptions,
            greeting['title'],
            greeting['body'],
            tag=f'background-greeting-{int(time.time() // BACKGROUND_GREETING_INTERVAL_SECONDS)}',
            data={'path': '/#', 'view': 'home'},
            renotify=True,
            require_interaction=False,
        )
        app_notifications_sent += delivered
        failures += failed

    if temperature_subscriptions:
        alerts = await get_watchlist_alerts()
        hottest_alert = max(
            alerts,
            key=lambda alert: alert.weather.current_temperature_c,
            default=None,
        )

        if hottest_alert:
            hottest_temperature = round(float(hottest_alert.weather.current_temperature_c), 1)
            await save_notification_state(
                'temperature-watch',
                {
                    'hottest_location': hottest_alert.location,
                    'hottest_temperature_c': hottest_temperature,
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                },
            )

            temperature_copy = _hottest_temperature_copy(hottest_alert)
            delivered, failed = await send_push_notification_to_subscriptions(
                temperature_subscriptions,
                temperature_copy['title'],
                temperature_copy['body'],
                tag=f'hottest-temperature-{hottest_alert.location}',
                data={'path': '/#', 'view': 'alerts'},
                renotify=True,
                require_interaction=False,
            )
            temperature_notifications_sent += delivered
            failures += failed

    return PushJobResponse(
        status='ok',
        app_notifications_sent=app_notifications_sent,
        temperature_notifications_sent=temperature_notifications_sent,
        failures=failures,
        strongest_temperature_change_c=hottest_temperature,
    )


@app.get('/sample-alerts', response_model=BatchResponse)
async def sample_alerts():
    results = await asyncio.gather(
        *(build_watchlist_alert(item) for item in SAMPLE_ALERT_ITEMS),
    )
    alerts = [result for result in results if result is not None]
    if not alerts:
        raise HTTPException(status_code=502, detail='Could not load sample Myanmar alerts from weather services.')
    return {'alerts': alerts}


@app.get('/locations', response_model=List[LocationOption])
def locations():
    return [
        LocationOption(
            region=str(item['region']),
            district=str(item['label']),
            query=str(item['query']),
            district_group=str(item['district_group']) if item.get('district_group') else None,
            menu_group=str(item['menu_group']) if item.get('menu_group') else str(item['region']),
            products=[str(product) for product in item.get('products') or []],
            latitude=float(item['latitude']) if item.get('latitude') is not None else None,
            longitude=float(item['longitude']) if item.get('longitude') is not None else None,
        )
        for item in LOCATION_MENU_ITEMS
    ]


@app.get('/push/config', response_model=PushConfigResponse)
def push_config():
    public_key = get_vapid_public_key()
    return {
        'enabled': bool(public_key and get_supabase_url() and get_supabase_service_role_key()),
        'public_key': public_key or None,
    }


@app.post('/push/subscribe')
async def push_subscribe(http_request: Request, request: PushSubscriptionRequest):
    if not get_vapid_public_key() or not get_vapid_private_key():
        raise HTTPException(status_code=503, detail='Web push is not configured.')
    _require_allowed_browser_origin(http_request)

    await upsert_push_subscription(
        {
            'endpoint': request.subscription.endpoint,
            'p256dh': request.subscription.keys.p256dh,
            'auth': request.subscription.keys.auth,
            'channels': request.channels.model_dump(),
            'user_agent': request.user_agent,
            'active': True,
            'updated_at': datetime.now(timezone.utc).isoformat(),
        },
    )
    return {'status': 'ok'}


@app.get('/live-notifications', response_model=BatchResponse)
async def live_notifications():
    alerts = await get_watchlist_alerts()
    return {'alerts': alerts}


@app.get('/admin-broadcast/current', response_model=AdminBroadcastEnvelope)
def admin_broadcast_current():
    return {'broadcast': _get_current_admin_broadcast()}


@app.post('/admin-broadcast', response_model=AdminBroadcastMessage)
async def admin_broadcast(http_request: Request, request: AdminBroadcastRequest):
    _require_allowed_browser_origin(http_request)
    _require_admin_token(http_request)
    delivered_count = 0
    failed_count = 0

    broadcast = AdminBroadcastMessage(
        id=f'admin-broadcast-{int(time.time() * 1000)}',
        title=request.title.strip(),
        body=request.body.strip(),
        created_at=datetime.now(timezone.utc).isoformat(),
        delivered_count=0,
        failed_count=0,
    )

    if get_vapid_public_key() and get_vapid_private_key() and get_supabase_url() and get_supabase_service_role_key():
        delivered_count, failed_count = await send_push_notification_to_channel(
            'app',
            broadcast.title,
            broadcast.body,
            tag=broadcast.id,
            data={'path': '/#', 'view': 'home'},
            renotify=True,
            require_interaction=True,
        )
        broadcast.delivered_count = delivered_count
        broadcast.failed_count = failed_count

    ADMIN_BROADCAST_STATE['broadcast'] = broadcast.model_dump()
    return broadcast


@app.post('/cron/background-notifications', response_model=PushJobResponse)
async def cron_background_notifications(request: Request):
    expected_secret = get_background_push_cron_secret()
    if not expected_secret:
        raise HTTPException(status_code=503, detail='Background push cron secret is not configured.')

    incoming_secret = request.headers.get('x-cron-secret', '')
    if incoming_secret != expected_secret:
        raise HTTPException(status_code=401, detail='Invalid cron secret.')

    try:
        return await run_background_push_cycle()
    except HTTPException as exc:
        return PushJobResponse(
            status='error',
            detail='Background notification job failed.',
            failures=1,
        )
    except Exception as exc:
        logger.exception('Background notification job failed.')
        return PushJobResponse(
            status='error',
            detail='Background notification job failed.',
            failures=1,
        )


@app.post('/predict', response_model=Alert)
async def predict(request: PredictRequest):
    return await build_live_alert(request)
