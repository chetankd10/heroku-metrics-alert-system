const test = require('node:test');
const assert = require('node:assert');
const { groupAppsByScope } = require('../src/herokuApi');

test('groupAppsByScope separates personal apps from team apps', () => {
  const apps = [
    { name: 'my-personal-app', team: null },
    { name: 'cs-ecom', team: { name: 'growth-team' } },
    { name: 'cs-ecom-metrics-alerts', team: { name: 'growth-team' } },
    { name: 'another-personal-app', team: null },
  ];

  const grouped = groupAppsByScope(apps);

  assert.deepStrictEqual(grouped.personal, ['another-personal-app', 'my-personal-app']);
  assert.deepStrictEqual(grouped.teams, {
    'growth-team': ['cs-ecom', 'cs-ecom-metrics-alerts'],
  });
});

test('groupAppsByScope handles an all-personal or all-team list', () => {
  assert.deepStrictEqual(groupAppsByScope([{ name: 'solo-app', team: null }]), {
    personal: ['solo-app'],
    teams: {},
  });
  assert.deepStrictEqual(groupAppsByScope([{ name: 'team-app', team: { name: 'ops' } }]), {
    personal: [],
    teams: { ops: ['team-app'] },
  });
});

test('groupAppsByScope returns empty groups for no apps', () => {
  assert.deepStrictEqual(groupAppsByScope([]), { personal: [], teams: {} });
});
