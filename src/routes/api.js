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

module.exports = router;
