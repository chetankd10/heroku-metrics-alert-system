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

router.get('/metrics/history', async (req, res) => {
  const requested = parseInt(req.query.minutes, 10);
  const minutes = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 1440) : 60;
  const rows = await db.metricsSince(minutes);
  res.json(rows);
});

module.exports = router;
