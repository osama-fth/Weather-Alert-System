const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const ALERT_MANAGER_URL =
  process.env.ALERT_MANAGER_URL || 'http://alert-manager:5001/current-alerts';
const WEATHER_FETCHER_URL =
  process.env.WEATHER_FETCHER_URL || 'http://weather-fetcher:5500/weather-alert';

// File statici
app.use(express.static('public'));

// Healthcheck
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Elenco regioni italiane (slug coerenti con weather-fetcher)
const REGIONS = [
  'piemonte','valledaosta','liguria','lombardia','trentino-altoadige','veneto',
  'friuli-venezia-giulia','emilia-romagna','toscana','umbria','marche','lazio',
  'abruzzo','molise','campania','puglia','basilicata','calabria','sicilia','sardegna'
];

app.get('/api/regions', (_req, res) => {
  res.json(REGIONS);
});

// Trigger raccolta meteo per regione (chiama weather-fetcher)
app.get('/api/fetch', async (req, res) => {
  try {
    const region = (req.query.region || '').trim();
    if (!region) return res.status(400).json({ error: 'region mancante' });
    const upstream = new URL(WEATHER_FETCHER_URL);
    upstream.searchParams.set('region', region);

    const upstreamRes = await fetch(upstream.toString(), { cache: 'no-store' });
    const data = await upstreamRes.json().catch(() => ({}));
    res.status(upstreamRes.ok ? 200 : 502).json({ ok: upstreamRes.ok, fetcher: data });
  } catch (err) {
    res.status(502).json({ ok: false, error: 'Failed to trigger fetcher', details: String(err) });
  }
});

// Proxy lato server verso alert-manager. Supporta ?region=...
app.get('/api/current-alerts', async (req, res) => {
  try {
    const region = req.query.region?.trim();
    const upstream = new URL(ALERT_MANAGER_URL);
    if (region) upstream.searchParams.set('region', region);

    const upstreamRes = await fetch(upstream.toString(), { cache: 'no-store' });
    if (!upstreamRes.ok) {
      throw new Error(`Upstream ${upstream} status ${upstreamRes.status}`);
    }
    const data = await upstreamRes.json();
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch alerts', details: String(err) });
  }
});

// Homepage
app.get('/', (_req, res) => {
  res.sendFile(require('path').join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard running on http://0.0.0.0:${PORT}`);
});
