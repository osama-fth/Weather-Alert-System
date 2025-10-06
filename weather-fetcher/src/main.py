from flask import Flask, request, jsonify
import os
import requests
import time
import hashlib

app = Flask(__name__)

ALERT_MANAGER_URL = os.getenv("ALERT_MANAGER_URL", "http://alert-manager:5001/receive-alerts")
FORECAST_DAYS = int(os.getenv("FORECAST_DAYS", "3"))  # giorni da analizzare (1-7)

# Coord “più precise” per regione (centroide + bbox per riferimento)
# Slug coerenti con la dashboard: usa questi parametri in ?region=
REGIONS = {
    "piemonte":               {"lat":45.066, "lon":7.682,  "bbox":[43.9,6.5,46.7,8.7]},
    "valledaosta":           {"lat":45.737, "lon":7.320,  "bbox":[45.4,6.9,46.0,7.9]},
    "liguria":               {"lat":44.407, "lon":8.934,  "bbox":[43.7,7.4,44.6,9.9]},
    "lombardia":             {"lat":45.585, "lon":9.930,  "bbox":[44.7,8.4,46.7,10.7]},
    "trentino-altoadige":    {"lat":46.433, "lon":11.169, "bbox":[45.7,10.3,47.1,12.5]},
    "veneto":                {"lat":45.438, "lon":12.327, "bbox":[44.7,10.6,46.7,13.1]},
    "friuli-venezia-giulia": {"lat":45.653, "lon":13.776, "bbox":[45.4,12.3,46.7,13.9]},
    "emilia-romagna":        {"lat":44.494, "lon":11.343, "bbox":[43.7,9.2,45.1,12.9]},
    "toscana":               {"lat":43.771, "lon":11.255, "bbox":[42.2,9.7,44.5,12.3]},
    "umbria":                {"lat":43.110, "lon":12.389, "bbox":[42.3,11.9,43.6,13.3]},
    "marche":                {"lat":43.616, "lon":13.518, "bbox":[42.7,12.2,44.6,13.9]},
    "lazio":                 {"lat":41.893, "lon":12.483, "bbox":[40.8,11.5,42.7,13.7]},
    "abruzzo":               {"lat":42.351, "lon":13.398, "bbox":[41.7,13.0,42.9,14.2]},
    "molise":                {"lat":41.560, "lon":14.659, "bbox":[41.3,14.3,41.9,15.1]},
    "campania":              {"lat":40.853, "lon":14.268, "bbox":[39.9,13.6,41.6,15.8]},
    "puglia":                {"lat":41.125, "lon":16.867, "bbox":[39.6,14.9,41.9,18.6]},
    "basilicata":            {"lat":40.640, "lon":15.805, "bbox":[39.9,15.2,41.2,16.8]},
    "calabria":              {"lat":38.905, "lon":16.594, "bbox":[37.9,15.6,39.9,17.3]},
    "sicilia":               {"lat":38.115, "lon":13.361, "bbox":[36.4,12.3,38.7,15.7]},
    "sardegna":              {"lat":39.223, "lon":9.121,  "bbox":[38.8,8.1,41.3,9.8]},
}

# Variabili daily richieste a Open-Meteo
DAILY_VARS = [
    "weathercode",
    "temperature_2m_max",
    "temperature_2m_min",
    "apparent_temperature_max",
    "apparent_temperature_min",
    "sunrise",
    "sunset",
    "daylight_duration",
    "sunshine_duration",
    "uv_index_max",
    "uv_index_clear_sky_max",
    "rain_sum",
    "showers_sum",
    "snowfall_sum",
    "precipitation_sum",
    "precipitation_hours",
    "precipitation_probability_max",
    "windspeed_10m_max",
    "windgusts_10m_max",
    "winddirection_10m_dominant",
    "shortwave_radiation_sum",
    "et0_fao_evapotranspiration",
]

# Threshold di default (override via querystring, es. &uv=8)
DEFAULT_THRESHOLDS = {
    "uv_index_max": 8,
    "temp_max_hot": 35,     # °C
    "temp_min_cold": -5,    # °C
    "precip_prob": 70,      # %
    "precip_sum": 10,       # mm
    "snowfall_sum": 5,      # cm
    "windspeed_max": 60,    # km/h
    "windgusts_max": 80,    # km/h
}

def _num(q, key, default):
    try:
        v = float(q.get(key, default))
        return v
    except Exception:
        return default

def build_alert_id(region: str, date_str: str, kind: str) -> str:
    s = f"{region}|{date_str}|{kind}"
    return hashlib.sha1(s.encode("utf-8")).hexdigest()  # id compatto

@app.get("/weather-alert")
def weather_alert():
    region = (request.args.get("region") or "").strip().lower()
    if region not in REGIONS:
        return jsonify({"error": "regione non valida", "supported": list(REGIONS.keys())}), 400

    # Threshold personalizzabili da query
    th = {
        "uv_index_max": _num(request.args, "uv", DEFAULT_THRESHOLDS["uv_index_max"]),
        "temp_max_hot": _num(request.args, "tmax", DEFAULT_THRESHOLDS["temp_max_hot"]),
        "temp_min_cold": _num(request.args, "tmin", DEFAULT_THRESHOLDS["temp_min_cold"]),
        "precip_prob": _num(request.args, "pp", DEFAULT_THRESHOLDS["precip_prob"]),
        "precip_sum": _num(request.args, "pr", DEFAULT_THRESHOLDS["precip_sum"]),
        "snowfall_sum": _num(request.args, "sn", DEFAULT_THRESHOLDS["snowfall_sum"]),
        "windspeed_max": _num(request.args, "ws", DEFAULT_THRESHOLDS["windspeed_max"]),
        "windgusts_max": _num(request.args, "wg", DEFAULT_THRESHOLDS["windgusts_max"]),
    }

    coords = REGIONS[region]
    lat, lon = coords["lat"], coords["lon"]

    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": ",".join(DAILY_VARS),
        "timezone": "auto",
        "forecast_days": max(1, min(7, FORECAST_DAYS)),
    }

    try:
        r = requests.get(url, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        return jsonify({"error": "open-meteo failure", "details": str(e)}), 502

    # Estrarre array daily
    daily = data.get("daily") or {}
    dates = daily.get("time") or []
    alerts = []

    def v(key):
        return daily.get(key) or []

    # Costruzione alert per ciascun giorno
    now_ts = int(time.time())
    for i, d in enumerate(dates):
        try:
            wcode = v("weathercode")[i]
            tmax = v("temperature_2m_max")[i]
            tmin = v("temperature_2m_min")[i]
            atmax = v("apparent_temperature_max")[i]
            atmin = v("apparent_temperature_min")[i]
            uv = v("uv_index_max")[i]
            uv_clear = v("uv_index_clear_sky_max")[i]
            pr_sum = v("precipitation_sum")[i]
            pr_prob = v("precipitation_probability_max")[i]
            rain = v("rain_sum")[i]
            showers = v("showers_sum")[i]
            snow = v("snowfall_sum")[i]
            pr_hours = v("precipitation_hours")[i]
            ws = v("windspeed_10m_max")[i]
            wg = v("windgusts_10m_max")[i]
            wdir = v("winddirection_10m_dominant")[i]
            sw = v("shortwave_radiation_sum")[i]
            et0 = v("et0_fao_evapotranspiration")[i]
            sunrise = v("sunrise")[i]
            sunset = v("sunset")[i]
            daylight = v("daylight_duration")[i]
            sunshine = v("sunshine_duration")[i]
        except Exception:
            continue

        # Fun util: crea alert
        def push(kind, title, level, message):
            alert = {
                "id": build_alert_id(region, d, kind),
                "region": region,
                "date": d,
                "timestamp": now_ts,  # quando creato l'alert
                "kind": kind,
                "level": level,  # low|medium|high|critical
                "title": title,
                "message": message,
                "metrics": {
                    "weathercode": wcode,
                    "tmax": tmax, "tmin": tmin, "atmax": atmax, "atmin": atmin,
                    "uv": uv, "uv_clear": uv_clear,
                    "precip_sum": pr_sum, "precip_prob": pr_prob, "rain_sum": rain, "showers_sum": showers,
                    "snowfall_sum": snow, "precip_hours": pr_hours,
                    "windspeed_max": ws, "windgusts_max": wg, "wind_dir": wdir,
                    "shortwave_sum": sw, "et0": et0,
                    "sunrise": sunrise, "sunset": sunset, "daylight_s": daylight, "sunshine_s": sunshine,
                },
            }
            alerts.append(alert)

        # Filtri/condizioni
        if tmax is not None and tmax >= th["temp_max_hot"]:
            lvl = "high" if tmax >= th["temp_max_hot"] + 3 else "medium"
            push("heat", f"Caldo intenso (Tmax {tmax}°C)", lvl, f"Giorno {d} Tmax {tmax}°C, UV {uv}")

        if tmin is not None and tmin <= th["temp_min_cold"]:
            lvl = "high" if tmin <= th["temp_min_cold"] - 3 else "medium"
            push("cold", f"Freddo intenso (Tmin {tmin}°C)", lvl, f"Giorno {d} Tmin {tmin}°C")

        if uv is not None and uv >= th["uv_index_max"]:
            lvl = "high" if uv >= th["uv_index_max"] + 2 else "medium"
            push("uv", f"UV elevato (indice {uv})", lvl, f"UV cielo sereno {uv_clear}")

        if (pr_prob is not None and pr_prob >= th["precip_prob"]) or (pr_sum is not None and pr_sum >= th["precip_sum"]):
            lvl = "high" if (pr_prob >= 90 or pr_sum >= (th["precip_sum"] + 10)) else "medium"
            push("rain", f"Piogge probabili ({pr_prob}% • {pr_sum} mm)", lvl, f"Ore precipitazione {pr_hours}, showers {showers} mm")

        if snow is not None and snow >= th["snowfall_sum"]:
            lvl = "high" if snow >= th["snowfall_sum"] + 10 else "medium"
            push("snow", f"Neve prevista ({snow} cm)", lvl, f"Temp min {tmin}°C — max {tmax}°C")

        if ws is not None and ws >= th["windspeed_max"]:
            lvl = "high" if ws >= th["windspeed_max"] + 20 or wg >= th["windgusts_max"] + 20 else "medium"
            push("wind", f"Vento forte ({ws} km/h, gust {wg} km/h)", lvl, f"Direzione dominante {wdir}°")

        if wg is not None and wg >= th["windgusts_max"]:
            lvl = "high" if wg >= th["windgusts_max"] + 20 else "medium"
            push("gusts", f"Raffiche forti ({wg} km/h)", lvl, f"Vento max {ws} km/h")

    # Invio all'alert-manager
    try:
        resp = requests.post(ALERT_MANAGER_URL, json={"alerts": alerts}, timeout=10)
        ok = resp.ok
        upstream = resp.json() if ok else {"status": resp.status_code}
    except Exception as e:
        ok = False
        upstream = {"error": str(e)}

    return jsonify({"ok": ok, "region": region, "created": len(alerts), "upstream": upstream, "coords": {"lat": lat, "lon": lon}}), (200 if ok else 502)

if __name__ == "__main__":
    # Avvio per sviluppo
    app.run(host="0.0.0.0", port=5500)
