const regionSelect = document.getElementById('region-select');
const intervalSelect = document.getElementById('interval-select');
const refreshBtn = document.getElementById('refresh-btn');
const clearBtn = document.getElementById('clear-btn');
const statusEl = document.getElementById('status');
const lastUpdatedEl = document.getElementById('last-updated');
const alertsEl = document.getElementById('alerts');
const emptyEl = document.getElementById('empty');
const rawEl = document.getElementById('raw');

let timer = null;
const STORAGE_KEYS = {
    region: 'dashboard.region',
    interval: 'dashboard.intervalMs',
};

function setStatus(msg, isError = false) {
    statusEl.innerHTML = isError ? '<span class="text-danger">' + msg + '</span>' : msg;
}

function fmtDate(d) {
    return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'medium' }).format(d);
}

async function loadRegions() {
    try {
        const res = await fetch('/api/regions');
        const regions = await res.json();
        // Aggiungi opzione "Tutte"
        const all = document.createElement('option');
        all.value = '';
        all.textContent = 'Tutte le regioni';
        regionSelect.appendChild(all);
        regions.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r;
            opt.textContent = r;
            regionSelect.appendChild(opt);
        });
        // Ripristina selezione
        const saved = localStorage.getItem(STORAGE_KEYS.region) ?? '';
        regionSelect.value = saved;
    } catch {
        // fallback statico se la chiamata fallisce
        const fallback = [
            'abruzzo', 'basilicata', 'calabria', 'campania', 'emilia-romagna', 'friuli-venezia-giulia',
            'lazio', 'liguria', 'lombardia', 'marche', 'molise', 'piemonte', 'puglia', 'sardegna',
            'sicilia', 'toscana', 'trentino-alto-adige', 'umbria', "valledaosta", 'veneto'
        ];
        const all = document.createElement('option');
        all.value = '';
        all.textContent = 'Tutte le regioni';
        regionSelect.appendChild(all);
        fallback.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r;
            opt.textContent = r;
            regionSelect.appendChild(opt);
        });
    }
}

function badgeForLevel(level) {
    const v = String(level || '').toLowerCase();
    const map = { critical: 'danger', high: 'danger', medium: 'warning', low: 'info', info: 'secondary' };
    const variant = map[v] || 'secondary';
    const label = level ? String(level).toUpperCase() : 'INFO';
    return '<span class="badge badge-level text-bg-' + variant + '">' + label + '</span>';
}

function renderAlerts(data) {
    alertsEl.innerHTML = '';
    let list = [];
    if (Array.isArray(data)) list = data;
    else if (data && Array.isArray(data.active_alerts)) list = data.active_alerts;
    else if (data && Array.isArray(data.alerts)) list = data.alerts;
    else if (data) list = [data];

    rawEl.textContent = JSON.stringify(data, null, 2);

    if (!list.length) {
        emptyEl.style.display = '';
        return;
    }
    emptyEl.style.display = 'none';

    list.forEach((a) => {
        const region = a.region || 'N/D';
        const title = a.alert || 'Alert';
        const message = a.description || `Lat: ${a.lat}, Lon: ${a.lon}`;
        const ts = a.timestamp || null;

        const card = document.createElement('div');
        card.className = 'col-12 col-lg-6';
        card.innerHTML = `
            <div class="card h-100 shadow-sm">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-start">
                  <h5 class="card-title mb-1">${title}</h5>
                  <span class="badge badge-level text-bg-secondary">INFO</span>
                </div>
                <div class="text-body-secondary small mb-2">
                  <span class="me-2"><i class="bi bi-geo-alt"></i> ${region}</span>
                  ${ts ? '<span>' + fmtDate(new Date(ts)) + '</span>' : ''}
                </div>
                <p class="card-text">${message ? String(message) : ''}</p>
              </div>
            </div>`;
        alertsEl.appendChild(card);
    });
}

async function load() {
    try {
        setStatus('Caricamento...');
        const region = regionSelect.value || '';
        if (region) {
            // 1) Trigghera il fetcher per la regione
            const triggerUrl = new URL('/api/fetch', window.location.origin);
            triggerUrl.searchParams.set('region', region);
            await fetch(triggerUrl.toString(), { cache: 'no-store' }).catch(() => {});
        }
        // 2) Leggi gli alert filtrati dall’alert-manager
        const url = new URL('/api/current-alerts', window.location.origin);
        if (region) url.searchParams.set('region', region);
        const res = await fetch(url.toString(), { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        renderAlerts(data);
        lastUpdatedEl.textContent = fmtDate(new Date());
        setStatus('Aggiornato');
    } catch (e) {
        setStatus('Errore: ' + e.message, true);
    }
}

function startTimer(ms) {
    if (timer) clearInterval(timer);
    if (ms > 0) timer = setInterval(load, ms);
}

// Eventi
regionSelect.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEYS.region, regionSelect.value || '');
    load();
});
refreshBtn.addEventListener('click', load);
clearBtn.addEventListener('click', () => {
    alertsEl.innerHTML = '';
    rawEl.textContent = '[]';
    emptyEl.style.display = '';
    setStatus('Pulito');
});
intervalSelect.addEventListener('change', () => {
    const ms = Number(intervalSelect.value || 0);
    localStorage.setItem(STORAGE_KEYS.interval, String(ms));
    startTimer(ms);
});

// Init
(async function init() {
    await loadRegions();
    const savedInterval = Number(localStorage.getItem(STORAGE_KEYS.interval) || 0);
    intervalSelect.value = String(savedInterval);
    startTimer(savedInterval);
    load();
})();
