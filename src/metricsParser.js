// Extracts Heroku "sample#key=value" metric lines and classifies which
// resource they came from (dyno, Postgres, Redis, Kafka, or other add-on).
//
// Examples of real log lines this parses:
//   source=web.1 dyno=heroku.123.abc sample#load_avg_1m=0.02 sample#memory_total=105.66MB
//   source=HEROKU_POSTGRESQL_NAVY sample#current_transaction=234 sample#active-connections=5
//   source=REDIS sample#used-memory=12.4MB sample#evicted-keys=0
//
// Exact key names vary by add-on/plan; this deliberately stores whatever
// sample#key=value pairs are present rather than hardcoding an exhaustive list.

const SAMPLE_PATTERN = /sample#([a-zA-Z0-9_.-]+)=([0-9]*\.?[0-9]+)([a-zA-Z%]*)/g;
const SOURCE_PATTERN = /(?:^|\s)source=(\S+)/;
const DYNO_SOURCE_PATTERN = /^(web|worker|clock|run|release)\.\d+$/i;

function classifyResourceType(source) {
  if (!source) return 'other';
  if (/^HEROKU_POSTGRESQL/i.test(source) || /POSTGRES/i.test(source)) return 'postgres';
  if (/REDIS/i.test(source)) return 'redis';
  if (/KAFKA/i.test(source)) return 'kafka';
  if (DYNO_SOURCE_PATTERN.test(source)) return 'dyno';
  return 'other';
}

function extractSource(message, procId) {
  const match = message.match(SOURCE_PATTERN);
  if (match) return match[1];
  if (procId && procId !== '-') return procId;
  return null;
}

// Parses a raw unit suffix like "MB", "%", "ms" into a normalized unit string.
function normalizeUnit(unit) {
  if (!unit) return null;
  return unit;
}

function extractMetrics(message, procId) {
  const source = extractSource(message, procId);
  const resourceType = classifyResourceType(source);
  const metrics = [];

  let match;
  SAMPLE_PATTERN.lastIndex = 0;
  while ((match = SAMPLE_PATTERN.exec(message)) !== null) {
    const [, metricName, rawValue, rawUnit] = match;
    metrics.push({
      source: source || 'unknown',
      resourceType,
      metricName,
      metricValue: parseFloat(rawValue),
      metricUnit: normalizeUnit(rawUnit),
    });
  }

  return metrics;
}

module.exports = { extractMetrics, classifyResourceType, extractSource };
