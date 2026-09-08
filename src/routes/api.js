const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/metrics/latest', async (req, res) => {
  const metrics = await db.latestMetrics();
  res.json(metrics);
});

router.get('/alerts', async (req, res) => {
  const alerts = await db.recentAlerts();
  res.json(alerts);
});

const MAX_HISTORY_MINUTES = 90 * 24 * 60; // 90 days

router.get('/metrics/history', async (req, res) => {
  const requested = parseInt(req.query.minutes, 10);
  const minutes = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_HISTORY_MINUTES) : 60;
  const dyno = typeof req.query.dyno === 'string' && req.query.dyno.trim() ? req.query.dyno.trim() : null;
  const rows = await db.metricsSince(minutes, dyno);
  res.json(rows);
});

router.get('/dynos', async (req, res) => {
  const dynos = await db.distinctDynoSources();
  res.json(dynos);
});

module.exports = router;
