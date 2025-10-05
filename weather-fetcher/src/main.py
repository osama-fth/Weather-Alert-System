from flask import Flask, request, jsonify
import requests
import os

ALERT_MANAGER_URL = os.environ.get("ALERT_MANAGER_URL", "http://alert-manager:5001/receive-alerts")
app = Flask(__name__)

# Soglie alert
ALERTS = {
    "temperature": {"high": 35, "low": -5},   # °C
    "wind_speed": 60,                          # km/h
    "precipitation": 20                        # mm/giorno
}

# Bounding box per regioni italiane
REGION_BBOX = {
    "piemonte": {"north": 46.0, "south": 44.5, "east": 8.0, "west": 6.5},
    "valledaosta": {"north": 45.8, "south": 45.4, "east": 7.5, "west": 6.9},
    "liguria": {"north": 44.5, "south": 43.5, "east": 9.5, "west": 7.5},
    "lombardia": {"north": 46.7, "south": 44.9, "east": 10.5, "west": 8.0},
    "trentino-altoadige": {"north": 47.1, "south": 45.8, "east": 12.7, "west": 10.5},
    "veneto": {"north": 46.7, "south": 44.9, "east": 13.5, "west": 11.5},
    "friuli-venezia-giulia": {"north": 46.7, "south": 45.3, "east": 14.9, "west": 12.5},
    "emilia-romagna": {"north": 45.7, "south": 43.4, "east": 12.7, "west": 9.5},
    "toscana": {"north": 44.4, "south": 42.0, "east": 12.9, "west": 9.9},
    "umbria": {"north": 43.3, "south": 42.3, "east": 13.2, "west": 12.0},
    "marche": {"north": 44.0, "south": 42.7, "east": 13.5, "west": 12.4},
    "lazio": {"north": 42.2, "south": 41.2, "east": 13.5, "west": 11.8},
    "abruzzo": {"north": 42.4, "south": 41.3, "east": 14.7, "west": 13.2},
    "molise": {"north": 42.1, "south": 41.2, "east": 15.3, "west": 14.1},
    "campania": {"north": 41.3, "south": 40.0, "east": 15.8, "west": 13.5},
    "puglia": {"north": 42.2, "south": 40.0, "east": 18.5, "west": 15.8},
    "basilicata": {"north": 41.3, "south": 39.9, "east": 16.8, "west": 15.3},
    "calabria": {"north": 39.4, "south": 37.8, "east": 17.8, "west": 15.9},
    "sicilia": {"north": 38.3, "south": 36.6, "east": 15.6, "west": 12.4},
    "sardegna": {"north": 41.3, "south": 38.9, "east": 9.8, "west": 8.0}
}

# Funzione per generare punti nel bbox
def generate_points(bbox, step=0.5):
    lat_points = []
    lon_points = []
    lat = bbox["south"]
    while lat <= bbox["north"]:
        lat_points.append(lat)
        lat += step
    lon = bbox["west"]
    while lon <= bbox["east"]:
        lon_points.append(lon)
        lon += step
    points = [{"lat": lat, "lon": lon} for lat in lat_points for lon in lon_points]
    return points

@app.route("/weather-alert", methods=["GET"])
def weather_alert():
    region = request.args.get("region", "").lower()
    if region not in REGION_BBOX:
        return jsonify({"error": "Regione non valida"}), 400

    bbox = REGION_BBOX[region]
    points = generate_points(bbox, step=0.5)

    alerts = set()
    points_data = []

    for point in points:
        url = (f"https://api.open-meteo.com/v1/forecast?"
               f"latitude={point['lat']}&longitude={point['lon']}&"
               f"daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&"
               f"timezone=Europe/Rome")
        try:
            resp = requests.get(url, timeout=5)
            data = resp.json()
            daily = data.get("daily", {})

            if daily:
                temp_max = daily["temperature_2m_max"][0]
                temp_min = daily["temperature_2m_min"][0]
                wind_max = daily["windspeed_10m_max"][0]
                precip_sum = daily["precipitation_sum"][0]

                point_alerts = []
                if temp_max >= ALERTS["temperature"]["high"]:
                    alerts.add("Allerta caldo")
                    point_alerts.append("Allerta caldo")
                if temp_min <= ALERTS["temperature"]["low"]:
                    alerts.add("Allerta freddo")
                    point_alerts.append("Allerta freddo")
                if wind_max >= ALERTS["wind_speed"]:
                    alerts.add("Allerta vento forte")
                    point_alerts.append("Allerta vento forte")
                if precip_sum >= ALERTS["precipitation"]:
                    alerts.add("Allerta pioggia intensa")
                    point_alerts.append("Allerta pioggia intensa")

                if point_alerts:
                    points_data.append({
                        "lat": point["lat"],
                        "lon": point["lon"],
                        "temperature_max": temp_max,
                        "temperature_min": temp_min,
                        "windspeed_max": wind_max,
                        "precipitation_sum": precip_sum,
                        "alerts": point_alerts
                    })

        except Exception as e:
            continue

    # Invia alert a alert-manager se ci sono
    if points_data:
        try:
            requests.post(ALERT_MANAGER_URL, json={
                "region": region,
                "points_with_alerts": points_data
            }, timeout=5)
        except Exception as e:
            print(f"Errore invio alert a alert-manager: {e}")

    return jsonify({
        "region": region,
        "total_points": len(points_data),
        "alerts": list(alerts),
        "points_with_alerts": points_data
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5500)
