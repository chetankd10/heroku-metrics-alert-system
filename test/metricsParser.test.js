const test = require('node:test');
const assert = require('node:assert');
const { extractMetrics, classifyResourceType } = require('../src/metricsParser');

test('classifyResourceType identifies dyno sources', () => {
  assert.strictEqual(classifyResourceType('web.1'), 'dyno');
  assert.strictEqual(classifyResourceType('worker.3'), 'dyno');
});

test('classifyResourceType identifies add-on sources', () => {
  assert.strictEqual(classifyResourceType('HEROKU_POSTGRESQL_NAVY'), 'postgres');
  assert.strictEqual(classifyResourceType('REDIS'), 'redis');
  assert.strictEqual(classifyResourceType('KAFKA'), 'kafka');
  assert.strictEqual(classifyResourceType('some-other-addon'), 'other');
});

test('extractMetrics parses sample#key=value pairs with units', () => {
  const message = 'source=web.1 dyno=heroku.1.abc sample#load_avg_1m=1.35 sample#memory_total=480.20MB';
  const metrics = extractMetrics(message, 'web.1');

  assert.strictEqual(metrics.length, 2);
  assert.deepStrictEqual(metrics[0], {
    source: 'web.1',
    resourceType: 'dyno',
    metricName: 'load_avg_1m',
    metricValue: 1.35,
    metricUnit: null,
  });
  assert.deepStrictEqual(metrics[1], {
    source: 'web.1',
    resourceType: 'dyno',
    metricName: 'memory_total',
    metricValue: 480.20,
    metricUnit: 'MB',
  });
});

test('extractMetrics falls back to procId when no source= present', () => {
  const metrics = extractMetrics('sample#active-connections=5', 'HEROKU_POSTGRESQL_NAVY');
  assert.strictEqual(metrics[0].source, 'HEROKU_POSTGRESQL_NAVY');
  assert.strictEqual(metrics[0].resourceType, 'postgres');
});

test('extractMetrics returns empty array when no sample# metrics present', () => {
  assert.deepStrictEqual(extractMetrics('just a regular log line', 'web.1'), []);
});
