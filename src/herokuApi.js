// Read-only Heroku Platform API access, used only to discover which apps
// this account/team can see. Never issues a write request - discovery is
// GET /apps and nothing else. Attaching drains stays a manual CLI step.
const HEROKU_API_BASE = 'https://api.heroku.com';
const CACHE_TTL_MS = 60 * 1000;

let cache = null;
let cacheExpiresAt = 0;

// Common Runtime apps have no `space`; Private Space apps have a `space`
// with `shield: false`; Shield Private Space apps have `shield: true`.
function classifySpace(app) {
  if (!app.space) return 'common';
  return app.space.shield ? 'shielded' : 'private';
}

function groupAppsByScope(apps) {
  const personal = [];
  const teams = {};
  const spaces = {};
  for (const app of apps) {
    const teamName = app.team && app.team.name;
    spaces[app.name] = classifySpace(app);
    if (teamName) {
      if (!teams[teamName]) teams[teamName] = [];
      teams[teamName].push(app.name);
    } else {
      personal.push(app.name);
    }
  }
  personal.sort();
  for (const name of Object.keys(teams)) teams[name].sort();
  return { personal, teams, spaces };
}

async function fetchApps(apiKey) {
  const res = await fetch(`${HEROKU_API_BASE}/apps`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/vnd.heroku+json; version=3',
    },
  });
  if (!res.ok) {
    throw new Error(`Heroku API GET /apps failed: ${res.status}`);
  }
  return res.json();
}

async function listAccessibleApps(apiKey) {
  if (cache && Date.now() < cacheExpiresAt) return cache;
  const apps = await fetchApps(apiKey);
  const grouped = groupAppsByScope(apps);
  cache = grouped;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return grouped;
}

module.exports = { classifySpace, groupAppsByScope, listAccessibleApps };
