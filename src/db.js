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
    CREATE INDEX IF NOT EXISTS idx_metrics_app ON metrics (app_name, recorded_at DESC);

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

async function latestMetrics(appName) {
  const params = [];
  let appClause = '';
  if (appName) {
    params.push(appName);
    appClause = `WHERE app_name = $1`;
  }
  // app_name is part of the DISTINCT ON / ORDER BY key so two apps that both
  // happen to log e.g. dyno/web.1/load_avg_1m don't collapse into one row.
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (app_name, resource_type, source, metric_name)
      app_name, resource_type, source, metric_name, metric_value, metric_unit, recorded_at
    FROM metrics
    ${appClause}
    ORDER BY app_name, resource_type, source, metric_name, recorded_at DESC`,
    params
  );
  return rows;
}

async function recentAlerts(limit = 50, appName) {
  const params = [limit];
  let appClause = '';
  if (appName) {
    params.push(appName);
    appClause = `WHERE app_name = $2`;
  }
  const { rows } = await pool.query(
    `SELECT * FROM alerts ${appClause} ORDER BY triggered_at DESC LIMIT $1`,
    params
  );
  return rows;
}

// Target roughly this many points per series regardless of the requested
// range, by averaging into time buckets - keeps a 90-day chart as cheap to
// render as a 15-minute one instead of shipping every raw row to the client.
const TARGET_POINTS_PER_SERIES = 300;

async function metricsSince(minutes, dynoSource, appName) {
  const bucketSeconds = Math.max(1, Math.ceil((minutes * 60) / TARGET_POINTS_PER_SERIES));
  const params = [minutes, bucketSeconds];
  let clauses = '';
  if (dynoSource) {
    params.push(dynoSource);
    // Only dyno-type rows are filtered by the selected dyno; other
    // resource types (postgres/redis/kafka) aren't tied to a dyno instance.
    clauses += ` AND (resource_type != 'dyno' OR source = $${params.length})`;
  }
  if (appName) {
    params.push(appName);
    clauses += ` AND app_name = $${params.length}`;
  }

  // app_name is part of the GROUP BY so two apps with the same
  // resource_type/source/metric_name (e.g. dyno/web.1/load_avg_1m) don't get
  // averaged together into one misleading series.
  const { rows } = await pool.query(
    `SELECT app_name, resource_type, source, metric_name, metric_unit,
        to_timestamp(floor(extract(epoch FROM recorded_at) / $2) * $2) AS recorded_at,
        avg(metric_value) AS metric_value
     FROM metrics
     WHERE recorded_at > now() - ($1 || ' minutes')::interval
     ${clauses}
     GROUP BY 1, 2, 3, 4, 5, 6
     ORDER BY 6 ASC
     LIMIT 20000`,
    params
  );
  return rows;
}

async function metricsBetween(startTime, endTime, dynoSource, appName) {
  const spanSeconds = Math.max(1, (endTime.getTime() - startTime.getTime()) / 1000);
  const bucketSeconds = Math.max(1, Math.ceil(spanSeconds / TARGET_POINTS_PER_SERIES));
  const params = [startTime, endTime, bucketSeconds];
  let clauses = '';
  if (dynoSource) {
    params.push(dynoSource);
    clauses += ` AND (resource_type != 'dyno' OR source = $${params.length})`;
  }
  if (appName) {
    params.push(appName);
    clauses += ` AND app_name = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT app_name, resource_type, source, metric_name, metric_unit,
        to_timestamp(floor(extract(epoch FROM recorded_at) / $3) * $3) AS recorded_at,
        avg(metric_value) AS metric_value
     FROM metrics
     WHERE recorded_at >= $1 AND recorded_at <= $2
     ${clauses}
     GROUP BY 1, 2, 3, 4, 5, 6
     ORDER BY 6 ASC
     LIMIT 20000`,
    params
  );
  return rows;
}

async function distinctDynoSources(appName) {
  const params = [];
  let appClause = '';
  if (appName) {
    params.push(appName);
    appClause = `AND app_name = $1`;
  }
  const { rows } = await pool.query(
    `SELECT DISTINCT source FROM metrics WHERE resource_type = 'dyno' ${appClause} ORDER BY source`,
    params
  );
  return rows.map((r) => r.source);
}

async function distinctAppNames() {
  const { rows } = await pool.query(`SELECT DISTINCT app_name FROM metrics ORDER BY app_name`);
  return rows.map((r) => r.app_name);
}

async function pruneOldMetrics(days) {
  await pool.query(`DELETE FROM metrics WHERE recorded_at < now() - ($1 || ' days')::interval`, [days]);
  await pool.query(`DELETE FROM alerts WHERE triggered_at < now() - ($1 || ' days')::interval`, [days]);
}

module.exports = {
  pool,
  init,
  insertMetric,
  insertAlert,
  latestMetrics,
  recentAlerts,
  metricsSince,
  metricsBetween,
  distinctDynoSources,
  distinctAppNames,
  pruneOldMetrics,
};
