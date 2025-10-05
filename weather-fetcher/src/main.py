from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

# Configurazione soglie alert
ALERTS = {
    "temperature": {"high": 35, "low": -5},   # °C
    "wind_speed": 60,                          # km/h
    "precipitation": 20                        # mm/h
}

# Mappa regioni → coordinate
REGION_COORDS = {
    "piemonte": {"lat": 45.07, "lon": 7.69},
    "valledaosta": {"lat": 45.74, "lon": 7.32},
    "liguria": {"lat": 44.41, "lon": 8.93},
    "lombardia": {"lat": 45.46, "lon": 9.19},
    "trentino-altoadige": {"lat": 46.07, "lon": 11.12},
    "veneto": {"lat": 45.44, "lon": 12.32},
    "friuli-venezia-giulia": {"lat": 45.65, "lon": 13.77},
    "emilia-romagna": {"lat": 44.49, "lon": 11.34},
    "toscana": {"lat": 43.77, "lon": 11.25},
    "umbria": {"lat": 43.11, "lon": 12.39},
    "marche": {"lat": 43.62, "lon": 13.52},
    "lazio": {"lat": 41.90, "lon": 12.50},
    "abruzzo": {"lat": 42.35, "lon": 13.40},
    "molise": {"lat": 41.56, "lon": 14.66},
    "campania": {"lat": 40.84, "lon": 14.25},
    "puglia": {"lat": 41.12, "lon": 16.87},
    "basilicata": {"lat": 40.64, "lon": 16.56},
    "calabria": {"lat": 38.91, "lon": 16.61},
    "sicilia": {"lat": 37.60, "lon": 14.01},
    "sardegna": {"lat": 39.22, "lon": 9.11}
}


@app.route("/weather-alert", methods=["GET"])
def weather_alert():
    region = request.args.get("region", "").lower()
    if region not in REGION_COORDS:
        return jsonify({"error": "Regione non valida"}), 400

    coords = REGION_COORDS[region]
    url = f"https://api.open-meteo.com/v1/forecast?latitude={coords['lat']}&longitude={coords['lon']}&current_weather=true"

    try:
        resp = requests.get(url, timeout=5)
        data = resp.json()
        current = data.get("current_weather", {})

        alerts = []
        if current.get("temperature") is not None:
            if current["temperature"] >= ALERTS["temperature"]["high"]:
                alerts.append("Allerta caldo")
            elif current["temperature"] <= ALERTS["temperature"]["low"]:
                alerts.append("Allerta freddo")

        if current.get("windspeed") is not None and current["windspeed"] >= ALERTS["wind_speed"]:
            alerts.append("Allerta vento forte")

        if current.get("precipitation") is not None and current["precipitation"] >= ALERTS["precipitation"]:
            alerts.append("Allerta pioggia intensa")

        return jsonify({
            "region": region,
            "current_weather": current,
            "alerts": alerts
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5500)
