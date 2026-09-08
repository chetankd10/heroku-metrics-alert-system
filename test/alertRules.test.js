const test = require('node:test');
const assert = require('node:assert');
const alertRules = require('../src/alertRules');

test('evaluate triggers when a threshold is breached', () => {
  const metric = { resourceType: 'dyno', metricName: 'load_avg_1m', metricValue: 2.0 };
  const rule = alertRules.evaluate(metric);
  assert.ok(rule);
  assert.strictEqual(rule.message, 'Dyno 1-minute load average is high');
});

test('evaluate returns null when within threshold', () => {
  const metric = { resourceType: 'dyno', metricName: 'load_avg_1m', metricValue: 0.1 };
  assert.strictEqual(alertRules.evaluate(metric), null);
});

test('evaluate ignores metrics for unmatched resource types', () => {
  const metric = { resourceType: 'kafka', metricName: 'load_avg_1m', metricValue: 99 };
  assert.strictEqual(alertRules.evaluate(metric), null);
});
