const express = require('express');
const db = require('./db');
const alertRules = require('./alertRules');
const { parseLogDrainBody } = require('./logDrain');
const { extractMetrics } = require('./metricsParser');
const apiRoutes = require('./routes/api');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const appName = process.env.MONITORED_APP_NAME || 'unnamed-app';

function checkDrainToken(req, res, next) {
  const expected = process.env.DRAIN_TOKEN;
  if (!expected) return next(); // no token configured: allow (local/dev only)

  const provided = req.query.token || req.get('x-drain-token');
  if (provided !== expected) {
    return res.status(401).send('invalid or missing drain token');
  }
  next();
}

app.post(
  '/log-drain',
  checkDrainToken,
  express.raw({ type: '*/*', limit: '10mb' }),
  async (req, res) => {
    try {
      const entries = parseLogDrainBody(req.body);

      for (const entry of entries) {
        const metrics = extractMetrics(entry.message, entry.procId);

        for (const metric of metrics) {
          await db.insertMetric(appName, metric, entry.message);

          const rule = alertRules.evaluate(metric);
          if (rule) {
            await db.insertAlert(appName, metric, rule);
            console.warn(
              `[ALERT] ${metric.resourceType}/${metric.source} ${metric.metricName}=${metric.metricValue} - ${rule.message}`
            );
          }
        }
      }

      res.status(200).send();
    } catch (err) {
      console.error('Failed to process log drain payload:', err);
      res.status(500).send();
    }
  }
);

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', apiRoutes);
app.use('/', dashboardRoutes);

const port = process.env.PORT || 3000;

db.init()
  .then(() => {
    app.listen(port, () => {
      console.log(`heroku-metrics-alert-system listening on ${port} (monitoring: ${appName})`);
      if (!process.env.DRAIN_TOKEN) {
        console.warn('DRAIN_TOKEN is not set - /log-drain is unauthenticated. Set it before deploying.');
      }
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

module.exports = app;
