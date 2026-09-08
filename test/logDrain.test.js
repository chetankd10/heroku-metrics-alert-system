const test = require('node:test');
const assert = require('node:assert');
const { splitFrames, parseSyslogMessage, parseLogDrainBody } = require('../src/logDrain');

test('splitFrames splits octet-counted frames', () => {
  const messages = ['hello world', 'second frame'];
  const body = messages.map((m) => `${Buffer.byteLength(m)} ${m}`).join('');
  const frames = splitFrames(Buffer.from(body, 'utf8'));
  assert.deepStrictEqual(frames, messages);
});

test('splitFrames returns nothing for malformed input', () => {
  assert.deepStrictEqual(splitFrames(Buffer.from('not-a-length frame', 'utf8')), []);
});

test('parseSyslogMessage extracts RFC5424 fields', () => {
  const raw = '<134>1 2024-01-01T00:00:00.000000+00:00 host app web.1 - - source=web.1 sample#load_avg_1m=0.5';
  const parsed = parseSyslogMessage(raw);
  assert.strictEqual(parsed.appName, 'app');
  assert.strictEqual(parsed.procId, 'web.1');
  assert.strictEqual(parsed.message, 'source=web.1 sample#load_avg_1m=0.5');
});

test('parseLogDrainBody parses multiple frames end to end', () => {
  const raw = '<134>1 2024-01-01T00:00:00.000000+00:00 host app web.1 - - source=web.1 sample#load_avg_1m=0.5';
  const body = `${Buffer.byteLength(raw)} ${raw}`;
  const entries = parseLogDrainBody(Buffer.from(body, 'utf8'));
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].procId, 'web.1');
});
