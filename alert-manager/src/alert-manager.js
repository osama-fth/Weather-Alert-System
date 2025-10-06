const express = require("express");
const bodyParser = require("body-parser");
const Redis = require("ioredis");

const app = express();
const redisHost = process.env.REDIS_HOST || "127.0.0.1";
const redisPort = process.env.REDIS_PORT || 6379;

const redis = new Redis({
    host: redisHost,
    port: redisPort
});


app.use(bodyParser.json());

// Riceve alert
app.post("/receive-alerts", async (req, res) => {
    const { region, points_with_alerts } = req.body;
    if (!region || !points_with_alerts) return res.status(400).json({ error: "Payload non valido" });

    let count = 0;

    for (const point of points_with_alerts) {
        const { lat, lon, alerts } = point;
        for (const alert of alerts) {
            const key = `alert:${region}:${lat}:${lon}:${alert}`;
            // salva con TTL 24h (86400s)
            await redis.set(key, JSON.stringify({ region, lat, lon, alert, timestamp: new Date().toISOString() }), "EX", 86400);
            count++;
        }
    }

    res.json({ status: "ok", total_alerts_received: count });
});

// Restituisce alert attivi (filtrabile per regione)
app.get("/current-alerts", async (req, res) => {
    const region = (req.query.region || "").toString().trim();
    const pattern = region ? `alert:${region}:*` : "alert:*";

    const alerts = [];
    let cursor = "0";
    do {
        const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
        cursor = next;
        if (keys.length) {
            const values = await redis.mget(keys);
            for (const v of values) {
                if (v) alerts.push(JSON.parse(v));
            }
        }
    } while (cursor !== "0");

    res.json({ active_alerts: alerts });
});

app.listen(5001, () => console.log("Alert Manager running on port 5001"));
