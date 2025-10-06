const els = {
  region: document.getElementById('region'),
  interval: document.getElementById('interval'),
  since: document.getElementById('since'),
  btnRefresh: document.getElementById('refresh'),
  btnClear: document.getElementById('clear'),
  status: document.getElementById('status'),
  lastUpdated: document.getElementById('last-updated'),
  alerts: document.getElementById('alerts'),
  empty: document.getElementById('empty'),
  raw: document.getElementById('raw'),
  uv: document.getElementById('flt-uv'),
  tmax: document.getElementById('flt-tmax'),
  tmin: document.getElementById('flt-tmin'),
  pp: document.getElementById('flt-pp'),
  pr: document.getElementById('flt-pr'),
  sn: document.getElementById('flt-sn'),
  ws: document.getElementById('flt-ws'),
  wg: document.getElementById('flt-wg'),
};

const STORAGE = {
  region: 'dash.region',
  interval: 'dash.interval',
  since: 'dash.since',
  filters: 'dash.filters',
};

let timer = null;

function setStatus(msg, error = false) {
  els.status.innerHTML = error ? `<span class="text-danger">${msg}</span>` : msg;
}

function fmtDate(d) {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'medium' }).format(d);
}

async function loadRegions() {
  try {
    const r = await fetch('/api/regions');
    const regions = await r.json();
    els.region.innerHTML = '';
    regions.forEach((slug) => {
      const opt = document.createElement('option');
      opt.value = slug;
      opt.textContent = slug.replaceAll('-', ' ');
      els.region.appendChild(opt);
    });
    const saved = localStorage.getItem(STORAGE.region);
    if (saved && regions.includes(saved)) els.region.value = saved;
    else els.region.selectedIndex = 0;
  } catch {
    // fallback minimale
    ['lazio','lombardia'].forEach((slug) => {
      const opt = document.createElement('option');
      opt.value = slug; opt.textContent = slug;
      els.region.appendChild(opt);
    });
  }
}

function saveFilters() {
  const f = {
    uv: els.uv.value, tmax: els.tmax.value, tmin: els.tmin.value,
    pp: els.pp.value, pr: els.pr.value, sn: els.sn.value,
    ws: els.ws.value, wg: els.wg.value,
  };
  localStorage.setItem(STORAGE.filters, JSON.stringify(f));
  return f;
}

function loadFilters() {
  try {
    const f = JSON.parse(localStorage.getItem(STORAGE.filters) || '{}');
    for (const [k, v] of Object.entries(f)) if (els[k]) els[k].value = v;
  } catch {}
}

function getFilters() {
  return {
    uv: els.uv.value, tmax: els.tmax.value, tmin: els.tmin.value,
    pp: els.pp.value, pr: els.pr.value, sn: els.sn.value,
    ws: els.ws.value, wg: els.wg.value,
  };
}

function badge(level) {
  const m = { critical: 'danger', high: 'danger', medium: 'warning', low: 'info', info: 'secondary' };
  const v = (m[String(level).toLowerCase()] || 'secondary');
  return `<span class="badge text-bg-${v}">${String(level).toUpperCase()}</span>`;
}

function renderAlerts(data) {
  els.alerts.innerHTML = '';
  let list = [];
  if (data && Array.isArray(data.active_alerts)) list = data.active_alerts;
  else if (Array.isArray(data)) list = data;

  els.raw.textContent = JSON.stringify(data, null, 2);

  if (!list.length) {
    els.empty.style.display = '';
    return;
  }
  els.empty.style.display = 'none';

  for (const a of list) {
    const region = a.region || 'N/D';
    const title = a.title || a.kind || 'Alert';
    const msg = a.message || '';
    const ts = a.timestamp ? fmtDate(new Date(a.timestamp * 1000)) : '';
    const k = a.kind || 'generic';
    const lvl = a.level || 'info';

    const metrics = a.metrics || {};
    const rows = [
      ['UV', metrics.uv],
      ['Tmax', metrics.tmax != null ? metrics.tmax + ' °C' : null],
      ['Tmin', metrics.tmin != null ? metrics.tmin + ' °C' : null],
      ['Pioggia', metrics.precip_sum != null ? metrics.precip_sum + ' mm' : null],
      ['Prob. prec.', metrics.precip_prob != null ? metrics.precip_prob + ' %' : null],
      ['Neve', metrics.snowfall_sum != null ? metrics.snowfall_sum + ' cm' : null],
      ['Vento', metrics.windspeed_max != null ? metrics.windspeed_max + ' km/h' : null],
      ['Raffiche', metrics.windgusts_max != null ? metrics.windgusts_max + ' km/h' : null],
    ].filter(([, v]) => v != null);

    const details = rows.map(([n, v]) => `<span class="me-3"><span class="text-body-secondary">${n}:</span> ${v}</span>`).join('');

    const col = document.createElement('div');
    col.className = 'col-12 col-lg-6';
    col.innerHTML = `
      <div class="card h-100 shadow-sm">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <h5 class="card-title mb-1">${title}</h5>
            ${badge(lvl)}
          </div>
          <div class="small text-body-secondary mb-2">
            <i class="bi bi-geo-alt"></i> ${region} · <i class="bi bi-tag"></i> ${k} ${ts ? '· ' + ts : ''}
          </div>
          <p class="card-text">${msg}</p>
          <div class="small">${details}</div>
        </div>
      </div>`;
    els.alerts.appendChild(col);
  }
}

async function cycleOnce() {
  try {
    setStatus('Caricamento...');
    const region = els.region.value;
    if (!region) {
      setStatus('Seleziona una regione', true);
      return;
    }

    // 1) Trigger weather-fetcher con filtri
    const f = getFilters();
    const trigger = new URL('/api/fetch', window.location.origin);
    trigger.searchParams.set('region', region);
    for (const [k, v] of Object.entries(f)) if (v !== '' && v != null) trigger.searchParams.set(k, v);
    await fetch(trigger.toString(), { cache: 'no-store' }).catch(() => {});

    // 2) Leggi alert filtrati per regione
    const url = new URL('/api/current-alerts', window.location.origin);
    url.searchParams.set('region', region);
    url.searchParams.set('since', els.since.value);
    url.searchParams.set('limit', '200');
    const r = await fetch(url.toString(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    renderAlerts(data);
    els.lastUpdated.textContent = fmtDate(new Date());
    setStatus('Aggiornato');
  } catch (e) {
    setStatus('Errore: ' + e.message, true);
  }
}

function startTimer(ms) {
  if (timer) clearInterval(timer);
  if (ms > 0) timer = setInterval(cycleOnce, ms);
}

function bindEvents() {
  els.btnRefresh.addEventListener('click', cycleOnce);
  els.btnClear.addEventListener('click', () => {
    els.alerts.innerHTML = '';
    els.raw.textContent = '[]';
    els.empty.style.display = '';
    setStatus('Pulito');
  });

  els.region.addEventListener('change', () => {
    localStorage.setItem(STORAGE.region, els.region.value);
    cycleOnce();
  });

  els.interval.addEventListener('change', () => {
    localStorage.setItem(STORAGE.interval, els.interval.value);
    startTimer(Number(els.interval.value || 0));
  });

  els.since.addEventListener('change', () => {
    localStorage.setItem(STORAGE.since, els.since.value);
    cycleOnce();
  });

  [els.uv, els.tmax, els.tmin, els.pp, els.pr, els.sn, els.ws, els.wg].forEach((el) => {
    el.addEventListener('change', () => {
      saveFilters();
      cycleOnce();
    });
  });
}

(async function init() {
  await loadRegions();
  loadFilters();

  // Ripristina preferenze
  const savedInt = localStorage.getItem(STORAGE.interval) || '10000';
  els.interval.value = savedInt;
  const savedSince = localStorage.getItem(STORAGE.since) || '21600';
  els.since.value = savedSince;

  bindEvents();
  startTimer(Number(savedInt || 0));
  cycleOnce();
})();
