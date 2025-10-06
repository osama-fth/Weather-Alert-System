/* eslint-disable no-console */
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ALERT_MANAGER_URL =
  process.env.ALERT_MANAGER_URL || 'http://alert-manager:5001/current-alerts';
const WEATHER_FETCHER_URL =
  process.env.WEATHER_FETCHER_URL || 'http://weather-fetcher:5500/weather-alert';

// Serve statici
app.use(express.static(path.join(__dirname, 'public')));

// Healthcheck
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Slugs regioni (allineati al fetcher)
const REGIONS = [
  'piemonte','valledaosta','liguria','lombardia','trentino-altoadige','veneto',
  'friuli-venezia-giulia','emilia-romagna','toscana','umbria','marche','lazio',
  'abruzzo','molise','campania','puglia','basilicata','calabria','sicilia','sardegna'
];

app.get('/api/regions', (_req, res) => res.json(REGIONS));

// Trigger weather-fetcher per regione + filtri threshold
app.get('/api/fetch', async (req, res) => {
  try {
    const region = (req.query.region || '').trim();
    if (!region) return res.status(400).json({ error: 'region mancante' });

    const upstream = new URL(WEATHER_FETCHER_URL);
    upstream.searchParams.set('region', region);

    // Passa i threshold se presenti
    const params = ['uv','tmax','tmin','pp','pr','sn','ws','wg','days'];
    for (const p of params) if (req.query[p] != null) upstream.searchParams.set(p, req.query[p]);

    const r = await fetch(upstream.toString(), { cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json({ ok: r.ok, fetcher: data });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
});

// Proxy verso alert-manager con filtro regione/tempo/limite
app.get('/api/current-alerts', async (req, res) => {
  try {
    const region = (req.query.region || '').trim();
    if (!region) return res.json({ active_alerts: [] });

    const upstream = new URL(ALERT_MANAGER_URL);
    upstream.searchParams.set('region', region);
    if (req.query.since) upstream.searchParams.set('since', req.query.since);
    if (req.query.limit) upstream.searchParams.set('limit', req.query.limit);

    const r = await fetch(upstream.toString(), { cache: 'no-store' });
    if (!r.ok) throw new Error('upstream ' + r.status);
    const data = await r.json();
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch alerts', details: String(e) });
  }
});

// Homepage
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard running on http://0.0.0.0:${PORT}`);
});
