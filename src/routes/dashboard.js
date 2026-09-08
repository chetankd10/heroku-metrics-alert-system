const express = require('express');

const router = express.Router();

// Pinned Chart.js build + SRI hash - do not swap to an unpinned "latest" URL.
const CHARTJS_SRC = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
const CHARTJS_INTEGRITY = 'sha384-NrKB+u6Ts6AtkIhwPixiKTzgSKNblyhlk0Sohlgar9UHUBzai/sgnNNWWd291xqt';

router.get('/', (req, res) => {
  const appName = process.env.MONITORED_APP_NAME || 'unnamed-app';

  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Heroku Metrics - ${appName}</title>
<script src="${CHARTJS_SRC}" integrity="${CHARTJS_INTEGRITY}" crossorigin="anonymous"></script>
<style>
  body { font-family: -apple-system, sans-serif; margin: 2rem; color: #222; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { text-align: left; padding: 0.4rem 0.8rem; border-bottom: 1px solid #ddd; font-size: 0.9rem; }
  th { background: #f5f5f5; }
  .alert-row { background: #fdecea; }
  .resource-dyno { color: #2b6cb0; }
  .resource-postgres { color: #6b46c1; }
  .resource-redis { color: #c53030; }
  .resource-kafka { color: #b7791f; }
  .empty { color: #888; font-style: italic; }
  .range-controls { margin-bottom: 1rem; display: flex; gap: 1.5rem; align-items: center; }
  .range-controls label { font-size: 0.85rem; margin-right: 0.4rem; }
  .range-controls select { padding: 0.3rem 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-size: 0.85rem; }
  #charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem; }
  .chart-card { border: 1px solid #ddd; border-radius: 6px; padding: 0.75rem; }
  .chart-card h3 { margin: 0 0 0.5rem 0; font-size: 0.9rem; font-weight: 600; }
  .chart-card canvas { max-height: 220px; }
</style>
</head>
<body>
  <h1>Heroku Metrics &mdash; ${appName}</h1>

  <h2>Metric history</h2>
  <div class="range-controls">
    <span>
      <label for="range-select">Range</label>
      <select id="range-select">
        <option value="15">15m</option>
        <option value="60" selected>1h</option>
        <option value="360">6h</option>
        <option value="1440">24h</option>
        <option value="10080">7d</option>
        <option value="43200">30d</option>
        <option value="129600">90d</option>
      </select>
    </span>
    <span>
      <label for="dyno-select">Dyno</label>
      <select id="dyno-select">
        <option value="">All dynos</option>
      </select>
    </span>
  </div>
  <div id="charts-grid">
    <p class="empty" id="charts-empty">Loading...</p>
  </div>

  <h2>Latest metrics</h2>
  <table id="metrics-table">
    <thead><tr><th>Resource</th><th>Source</th><th>Metric</th><th>Value</th><th>Unit</th><th>Recorded</th></tr></thead>
    <tbody><tr><td class="empty" colspan="6">Loading...</td></tr></tbody>
  </table>

  <h2>Recent alerts</h2>
  <table id="alerts-table">
    <thead><tr><th>Resource</th><th>Source</th><th>Metric</th><th>Value</th><th>Threshold</th><th>Message</th><th>Triggered</th></tr></thead>
    <tbody><tr><td class="empty" colspan="7">Loading...</td></tr></tbody>
  </table>

<script>
function td(text) {
  const cell = document.createElement('td');
  cell.textContent = text === null || text === undefined ? '' : text;
  return cell;
}

async function refreshMetrics() {
  const res = await fetch('/api/metrics/latest');
  const rows = await res.json();
  const tbody = document.querySelector('#metrics-table tbody');
  tbody.innerHTML = '';
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const cell = td('No metrics received yet. Confirm the log drain is attached.');
    cell.className = 'empty';
    cell.colSpan = 6;
    tr.appendChild(cell);
    tbody.appendChild(tr);
    return;
  }
  for (const row of rows) {
    const tr = document.createElement('tr');
    const resourceCell = td(row.resource_type);
    resourceCell.className = 'resource-' + row.resource_type;
    tr.appendChild(resourceCell);
    tr.appendChild(td(row.source));
    tr.appendChild(td(row.metric_name));
    tr.appendChild(td(row.metric_value));
    tr.appendChild(td(row.metric_unit));
    tr.appendChild(td(new Date(row.recorded_at).toLocaleString()));
    tbody.appendChild(tr);
  }
}

async function refreshAlerts() {
  const res = await fetch('/api/alerts');
  const rows = await res.json();
  const tbody = document.querySelector('#alerts-table tbody');
  tbody.innerHTML = '';
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const cell = td('No alerts triggered yet.');
    cell.className = 'empty';
    cell.colSpan = 7;
    tr.appendChild(cell);
    tbody.appendChild(tr);
    return;
  }
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.className = 'alert-row';
    tr.appendChild(td(row.resource_type));
    tr.appendChild(td(row.source));
    tr.appendChild(td(row.metric_name));
    tr.appendChild(td(row.metric_value));
    tr.appendChild(td(row.threshold));
    tr.appendChild(td(row.message));
    tr.appendChild(td(new Date(row.triggered_at).toLocaleString()));
    tbody.appendChild(tr);
  }
}

let rangeMinutes = 60;
let dynoFilter = '';
const charts = new Map(); // seriesKey -> Chart instance

function seriesKey(row) {
  return row.resource_type + '::' + row.source + '::' + row.metric_name;
}

function seriesLabel(row) {
  return row.resource_type + ' / ' + row.source + ' / ' + row.metric_name + (row.metric_unit ? ' (' + row.metric_unit + ')' : '');
}

function formatLabel(recordedAt, minutes) {
  const d = new Date(recordedAt);
  if (minutes > 1440) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

async function refreshDynoOptions() {
  const res = await fetch('/api/dynos');
  const dynos = await res.json();
  const select = document.getElementById('dyno-select');
  const existing = new Set(Array.from(select.options).map((o) => o.value));
  for (const dyno of dynos) {
    if (existing.has(dyno)) continue;
    const opt = document.createElement('option');
    opt.value = dyno;
    opt.textContent = dyno;
    select.appendChild(opt);
  }
}

async function refreshCharts() {
  const params = new URLSearchParams({ minutes: String(rangeMinutes) });
  if (dynoFilter) params.set('dyno', dynoFilter);
  const res = await fetch('/api/metrics/history?' + params.toString());
  const rows = await res.json();
  const grid = document.getElementById('charts-grid');
  const emptyNotice = document.getElementById('charts-empty');

  const grouped = new Map();
  for (const row of rows) {
    const key = seriesKey(row);
    if (!grouped.has(key)) grouped.set(key, { row, labels: [], values: [] });
    const entry = grouped.get(key);
    entry.labels.push(formatLabel(row.recorded_at, rangeMinutes));
    entry.values.push(row.metric_value);
  }

  if (grouped.size === 0) {
    if (emptyNotice) emptyNotice.textContent = 'No metrics received yet in this time range.';
    return;
  }
  if (emptyNotice) emptyNotice.remove();

  for (const key of Array.from(charts.keys())) {
    if (!grouped.has(key)) {
      charts.get(key).destroy();
      document.getElementById('card-' + cssSafe(key))?.remove();
      charts.delete(key);
    }
  }

  for (const [key, { row, labels, values }] of grouped) {
    let chart = charts.get(key);
    if (!chart) {
      const card = document.createElement('div');
      card.className = 'chart-card';
      card.id = 'card-' + cssSafe(key);

      const title = document.createElement('h3');
      title.textContent = seriesLabel(row);
      card.appendChild(title);

      const canvas = document.createElement('canvas');
      card.appendChild(canvas);
      grid.appendChild(card);

      chart = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{ data: values, borderColor: '#2b6cb0', backgroundColor: 'rgba(43,108,176,0.1)', pointRadius: 0, borderWidth: 1.5, tension: 0.15 }],
        },
        options: {
          animation: false,
          scales: {
            x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
            y: { beginAtZero: true },
          },
          plugins: { legend: { display: false } },
        },
      });
      charts.set(key, chart);
    } else {
      chart.data.labels = labels;
      chart.data.datasets[0].data = values;
      chart.update('none');
    }
  }
}

function cssSafe(key) {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

document.getElementById('range-select').addEventListener('change', (e) => {
  rangeMinutes = parseInt(e.target.value, 10);
  refreshCharts().catch(console.error);
});

document.getElementById('dyno-select').addEventListener('change', (e) => {
  dynoFilter = e.target.value;
  refreshCharts().catch(console.error);
});

function refreshAll() {
  refreshMetrics().catch(console.error);
  refreshAlerts().catch(console.error);
  refreshDynoOptions().catch(console.error);
  refreshCharts().catch(console.error);
}

refreshAll();
setInterval(refreshAll, 10000);
</script>
</body>
</html>`);
});

module.exports = router;
