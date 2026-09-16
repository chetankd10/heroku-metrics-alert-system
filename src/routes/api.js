const express = require('express');
const db = require('../db');
const herokuApi = require('../herokuApi');

const router = express.Router();

function readAppParam(req) {
  return typeof req.query.app === 'string' && req.query.app.trim() ? req.query.app.trim() : null;
}

// The source dropdown's option values are "<resourceType>::<source>" so a
// selection like "postgres::DATABASE" can't be confused with a dyno also
// named "DATABASE" - it filters on both columns together.
function readSourceParam(req) {
  const raw = typeof req.query.source === 'string' ? req.query.source.trim() : '';
  if (!raw) return null;
  const idx = raw.indexOf('::');
  if (idx === -1) return null;
  return { resourceType: raw.slice(0, idx), source: raw.slice(idx + 2) };
}

router.get('/metrics/latest', async (req, res) => {
  const metrics = await db.latestMetrics(readAppParam(req));
  res.json(metrics);
});

router.get('/alerts', async (req, res) => {
  const alerts = await db.recentAlerts(50, readAppParam(req));
  res.json(alerts);
});

const MAX_HISTORY_MINUTES = 90 * 24 * 60; // 90 days
const MAX_HISTORY_MS = MAX_HISTORY_MINUTES * 60 * 1000;

router.get('/metrics/history', async (req, res) => {
  const source = readSourceParam(req);
  const app = readAppParam(req);

  if (req.query.start) {
    const start = new Date(req.query.start);
    const end = req.query.end ? new Date(req.query.end) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: 'invalid start/end' });
    }
    const clampedStart = end.getTime() - start.getTime() > MAX_HISTORY_MS
      ? new Date(end.getTime() - MAX_HISTORY_MS)
      : start;
    const rows = await db.metricsBetween(clampedStart, end, source, app);
    return res.json(rows);
  }

  const requested = parseInt(req.query.minutes, 10);
  const minutes = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_HISTORY_MINUTES) : 60;
  const rows = await db.metricsSince(minutes, source, app);
  res.json(rows);
});

router.get('/sources', async (req, res) => {
  const sources = await db.distinctSources(readAppParam(req));
  res.json(sources);
});

// Apps that have actually sent metrics to this service (definitely monitored).
router.get('/apps', async (req, res) => {
  const apps = await db.distinctAppNames();
  res.json(apps);
});

// Read-only Heroku Platform API discovery: every app this account/team can
// see, grouped by Personal/Team, so you can find apps that aren't monitored
// yet. Never writes anything - attaching a drain is still a manual CLI step.
router.get('/heroku/apps', async (req, res) => {
  const apiKey = process.env.HEROKU_API_KEY;
  if (!apiKey) {
    return res.json({ enabled: false, personal: [], teams: {}, spaces: {} });
  }
  try {
    const grouped = await herokuApi.listAccessibleApps(apiKey);
    res.json({ enabled: true, ...grouped });
  } catch (err) {
    console.error('Heroku API app discovery failed:', err.message);
    res.status(502).json({ enabled: true, error: 'discovery_failed', personal: [], teams: {}, spaces: {} });
  }
});

module.exports = router;
