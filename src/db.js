const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS metrics (
      id BIGSERIAL PRIMARY KEY,
      app_name TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      source TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      metric_value DOUBLE PRECISION,
      metric_unit TEXT,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      raw_line TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_recorded_at ON metrics (recorded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_metrics_lookup ON metrics (resource_type, source, metric_name, recorded_at DESC);

    CREATE TABLE IF NOT EXISTS alerts (
      id BIGSERIAL PRIMARY KEY,
      app_name TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      source TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      metric_value DOUBLE PRECISION,
      threshold DOUBLE PRECISION,
      operator TEXT,
      message TEXT,
      triggered_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_triggered_at ON alerts (triggered_at DESC);
  `);
}

async function insertMetric(appName, metric, rawLine) {
  await pool.query(
    `INSERT INTO metrics (app_name, resource_type, source, metric_name, metric_value, metric_unit, raw_line)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [appName, metric.resourceType, metric.source, metric.metricName, metric.metricValue, metric.metricUnit, rawLine]
  );
}

async function insertAlert(appName, metric, rule) {
  await pool.query(
    `INSERT INTO alerts (app_name, resource_type, source, metric_name, metric_value, threshold, operator, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [appName, metric.resourceType, metric.source, metric.metricName, metric.metricValue, rule.threshold, rule.operator, rule.message]
  );
}

async function latestMetrics() {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (resource_type, source, metric_name)
      resource_type, source, metric_name, metric_value, metric_unit, recorded_at
    FROM metrics
    ORDER BY resource_type, source, metric_name, recorded_at DESC
  `);
  return rows;
}

async function recentAlerts(limit = 50) {
  const { rows } = await pool.query(
    `SELECT * FROM alerts ORDER BY triggered_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

async function metricsSince(minutes) {
  const { rows } = await pool.query(
    `SELECT resource_type, source, metric_name, metric_unit, metric_value, recorded_at
     FROM metrics
     WHERE recorded_at > now() - ($1 || ' minutes')::interval
     ORDER BY recorded_at ASC
     LIMIT 20000`,
    [minutes]
  );
  return rows;
}

module.exports = { pool, init, insertMetric, insertAlert, latestMetrics, recentAlerts, metricsSince };
