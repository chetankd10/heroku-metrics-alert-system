const test = require('node:test');
const assert = require('node:assert');
const { classifySpace, groupAppsByScope } = require('../src/herokuApi');

test('classifySpace identifies common, private, and shielded apps', () => {
  assert.strictEqual(classifySpace({ space: null }), 'common');
  assert.strictEqual(classifySpace({ space: { shield: false } }), 'private');
  assert.strictEqual(classifySpace({ space: { shield: true } }), 'shielded');
});

test('groupAppsByScope separates personal apps from team apps', () => {
  const apps = [
    { name: 'my-personal-app', team: null, space: null },
    { name: 'cs-ecom', team: { name: 'growth-team' }, space: { shield: false } },
    { name: 'cs-ecom-metrics-alerts', team: { name: 'growth-team' }, space: { shield: true } },
    { name: 'another-personal-app', team: null, space: null },
  ];

  const grouped = groupAppsByScope(apps);

  assert.deepStrictEqual(grouped.personal, ['another-personal-app', 'my-personal-app']);
  assert.deepStrictEqual(grouped.teams, {
    'growth-team': ['cs-ecom', 'cs-ecom-metrics-alerts'],
  });
  assert.deepStrictEqual(grouped.spaces, {
    'my-personal-app': 'common',
    'another-personal-app': 'common',
    'cs-ecom': 'private',
    'cs-ecom-metrics-alerts': 'shielded',
  });
});

test('groupAppsByScope handles an all-personal or all-team list', () => {
  assert.deepStrictEqual(groupAppsByScope([{ name: 'solo-app', team: null, space: null }]), {
    personal: ['solo-app'],
    teams: {},
    spaces: { 'solo-app': 'common' },
  });
  assert.deepStrictEqual(
    groupAppsByScope([{ name: 'team-app', team: { name: 'ops' }, space: { shield: true } }]),
    {
      personal: [],
      teams: { ops: ['team-app'] },
      spaces: { 'team-app': 'shielded' },
    }
  );
});

test('groupAppsByScope returns empty groups for no apps', () => {
  assert.deepStrictEqual(groupAppsByScope([]), { personal: [], teams: {}, spaces: {} });
});
