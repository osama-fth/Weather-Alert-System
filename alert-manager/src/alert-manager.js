const express = require("express");
const { createClient } = require("redis");

const app = express();
app.use(express.json({ limit: "1mb" }));

const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);

// Retention configurabile
const RETENTION_SECONDS = Number(process.env.RETENTION_SECONDS || 48 * 3600); // 48h
const MAX_PER_REGION = Number(process.env.MAX_PER_REGION || 200);            // max elementi per regione

const redis = createClient({ url: `redis://${REDIS_HOST}:${REDIS_PORT}` });
redis.on("error", (e) => console.error("Redis error", e));
redis.on("connect", () => console.log("Redis connected"));
redis.connect();

// Key helpers
const keyAlert = (id) => `alert:${id}`;
const keyIdxRegion = (region) => `alerts:index:${region}`; // ZSET score=timestamp

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Riceve alert dal fetcher
app.post("/receive-alerts", async (req, res) => {
  try {
    const payload = req.body || {};
    const arr = Array.isArray(payload) ? payload : (payload.alerts || []);
    if (!Array.isArray(arr) || arr.length === 0) {
      return res.json({ stored: 0 });
    }

    const now = Math.floor(Date.now() / 1000);
    const pipeline = redis.multi();

    for (const a of arr) {
      const region = String(a.region || "").toLowerCase() || "unknown";
      const id = a.id || require("crypto").createHash("sha1").update(`${region}|${a.date || now}|${a.title || a.kind || "alert"}`).digest("hex");
      const ts = Number(a.timestamp || now);

      const alertObj = {
        id,
        region,
        timestamp: ts,
        date: a.date || null,
        level: a.level || "info",
        kind: a.kind || "generic",
        title: a.title || "Alert",
        message: a.message || "",
        metrics: a.metrics || {},
      };

      // Salva JSON con TTL
      pipeline.set(keyAlert(id), JSON.stringify(alertObj), { EX: RETENTION_SECONDS });

      // Indicizza per regione
      pipeline.zAdd(keyIdxRegion(region), [{ score: ts, value: id }]);
      // Trim per retention temporale
      pipeline.zRemRangeByScore(keyIdxRegion(region), 0, now - RETENTION_SECONDS);
      // Trim per cardinalità (se eccede, rimuove i più vecchi)
      pipeline.zCard(keyIdxRegion(region));
      pipeline.exec; // placeholder, il controllo cardinalità lo faremo dopo
    }

    // Esegue pipeline di insert
    await pipeline.exec();

    // Trim cardinalità per ciascuna regione toccata
    const regionsTouched = [...new Set(arr.map(a => (String(a.region || "").toLowerCase() || "unknown")))];
    for (const r of regionsTouched) {
      const card = await redis.zCard(keyIdxRegion(r));
      if (card > MAX_PER_REGION) {
        const toRemove = card - MAX_PER_REGION;
        await redis.zRemRangeByRank(keyIdxRegion(r), 0, toRemove - 1);
      }
    }

    res.json({ stored: arr.length, regions: regionsTouched.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "store_failed", details: String(e) });
  }
});

// Lettura alert correnti, filtrabili per regione, da quando, e limite
// GET /current-alerts?region=piemonte&since=3600&limit=50
app.get("/current-alerts", async (req, res) => {
  try {
    const region = (req.query.region || "").toString().toLowerCase().trim();
    const since = Number(req.query.since || 6 * 3600); // default ultime 6 ore
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));

    if (!region) {
      return res.json({ active_alerts: [] }); // richiedi sempre una regione specifica
    }

    const now = Math.floor(Date.now() / 1000);
    const minScore = now - Math.min(since, RETENTION_SECONDS);

    // Recupera IDs per score (dal più recente)
    const ids = await redis.zRangeByScore(keyIdxRegion(region), minScore, now, {
      LIMIT: { offset: 0, count: limit },
      REV: true, // più recenti prima
    });

    if (!ids.length) {
      return res.json({ active_alerts: [] });
    }

    // mGet JSON alerts
    const pipeline = redis.multi();
    for (const id of ids) pipeline.get(keyAlert(id));
    const rows = await pipeline.exec();
    const alerts = rows
      .map((r) => (Array.isArray(r) ? r[1] : r)) // compat redis client
      .map((s) => {
        try { return JSON.parse(s); } catch { return null; }
      })
      .filter(Boolean);

    res.json({ active_alerts: alerts });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "read_failed", details: String(e) });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Alert Manager running on port ${PORT}`);
});
