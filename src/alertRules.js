// Default alert thresholds. Edit this list to tune for your app -
// exact metric names/units depend on the add-on and plan emitting them.
const RULES = [
  { resourceType: 'dyno', metricPattern: /^load_avg_1m$/, operator: '>', threshold: 1.0,
    message: 'Dyno 1-minute load average is high' },
  { resourceType: 'dyno', metricPattern: /^memory_total$/, operator: '>', threshold: 450,
    message: 'Dyno memory usage is high (check for a leak or undersized dyno)' },

  { resourceType: 'postgres', metricPattern: /^active-connections$/, operator: '>', threshold: 90,
    message: 'Postgres active connections are high' },
  { resourceType: 'postgres', metricPattern: /^load-avg-1m$/, operator: '>', threshold: 1.0,
    message: 'Postgres load average is high' },
  { resourceType: 'postgres', metricPattern: /^memory-cached$|^memory-free$/, operator: '<', threshold: 50,
    message: 'Postgres free/cached memory is low' },

  { resourceType: 'redis', metricPattern: /^evicted-keys$/, operator: '>', threshold: 0,
    message: 'Redis is evicting keys - possible memory pressure' },
  { resourceType: 'redis', metricPattern: /^blocked-clients$/, operator: '>', threshold: 0,
    message: 'Redis has blocked clients' },

  { resourceType: 'kafka', metricPattern: /lag/i, operator: '>', threshold: 1000,
    message: 'Kafka consumer lag is high' },
];

function evaluate(metric) {
  for (const rule of RULES) {
    if (rule.resourceType !== metric.resourceType) continue;
    if (!rule.metricPattern.test(metric.metricName)) continue;

    const breached = rule.operator === '>'
      ? metric.metricValue > rule.threshold
      : metric.metricValue < rule.threshold;

    if (breached) return rule;
  }
  return null;
}

module.exports = { RULES, evaluate };
