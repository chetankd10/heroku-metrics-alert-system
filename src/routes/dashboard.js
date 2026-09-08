const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  const appName = process.env.MONITORED_APP_NAME || 'unnamed-app';

  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Heroku Metrics - ${appName}</title>
<style>
  body { font-family: -apple-system, sans-serif; margin: 2rem; color: #222; }
  h1 { font-size: 1.4rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { text-align: left; padding: 0.4rem 0.8rem; border-bottom: 1px solid #ddd; font-size: 0.9rem; }
  th { background: #f5f5f5; }
  .alert-row { background: #fdecea; }
  .resource-dyno { color: #2b6cb0; }
  .resource-postgres { color: #6b46c1; }
  .resource-redis { color: #c53030; }
  .resource-kafka { color: #b7791f; }
  .empty { color: #888; font-style: italic; }
</style>
</head>
<body>
  <h1>Heroku Metrics &mdash; ${appName}</h1>

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

function refreshAll() {
  refreshMetrics().catch(console.error);
  refreshAlerts().catch(console.error);
}

refreshAll();
setInterval(refreshAll, 10000);
</script>
</body>
</html>`);
});

module.exports = router;
