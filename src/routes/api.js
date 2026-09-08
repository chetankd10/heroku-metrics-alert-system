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
const MAX_HISTORY_MS = MAX_HISTORY_MINUTES * 60 * 1000;

router.get('/metrics/history', async (req, res) => {
  const dyno = typeof req.query.dyno === 'string' && req.query.dyno.trim() ? req.query.dyno.trim() : null;

  if (req.query.start) {
    const start = new Date(req.query.start);
    const end = req.query.end ? new Date(req.query.end) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: 'invalid start/end' });
    }
    const clampedStart = end.getTime() - start.getTime() > MAX_HISTORY_MS
      ? new Date(end.getTime() - MAX_HISTORY_MS)
      : start;
    const rows = await db.metricsBetween(clampedStart, end, dyno);
    return res.json(rows);
  }

  const requested = parseInt(req.query.minutes, 10);
  const minutes = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_HISTORY_MINUTES) : 60;
  const rows = await db.metricsSince(minutes, dyno);
  res.json(rows);
});

router.get('/dynos', async (req, res) => {
  const dynos = await db.distinctDynoSources();
  res.json(dynos);
});

module.exports = router;
