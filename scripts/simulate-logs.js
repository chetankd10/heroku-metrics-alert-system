// Simulates a Heroku log drain HTTPS POST against a locally running server,
// so you can see metrics/alerts appear on the dashboard without deploying
// or waiting on real traffic.
//
// Usage: npm start (in one terminal), then npm run simulate (in another).

const http = require('http');

const SAMPLE_LINES = [
  '<134>1 2024-01-01T00:00:00.000000+00:00 host app web.1 - - source=web.1 dyno=heroku.1.abc sample#load_avg_1m=1.35 sample#memory_total=480.20MB',
  '<134>1 2024-01-01T00:00:01.000000+00:00 host app HEROKU_POSTGRESQL_NAVY - - source=HEROKU_POSTGRESQL_NAVY sample#active-connections=97 sample#load-avg-1m=0.42',
  '<134>1 2024-01-01T00:00:02.000000+00:00 host app REDIS - - source=REDIS sample#used-memory=12.40MB sample#evicted-keys=3',
  '<134>1 2024-01-01T00:00:03.000000+00:00 host app KAFKA - - source=KAFKA sample#consumer-lag=1500',
];

function frame(message) {
  return `${Buffer.byteLength(message, 'utf8')} ${message}`;
}

const body = SAMPLE_LINES.map(frame).join('');
const host = process.env.SIMULATE_HOST || 'localhost';
const port = process.env.PORT || 3000;
const token = process.env.DRAIN_TOKEN || '';
const path = token ? `/log-drain?token=${encodeURIComponent(token)}` : '/log-drain';

const req = http.request(
  {
    host,
    port,
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/logplex-1',
      'Content-Length': Buffer.byteLength(body),
    },
  },
  (res) => {
    console.log(`Response: ${res.statusCode}`);
    res.on('data', () => {});
    res.on('end', () => console.log('Done. Check the dashboard at http://localhost:' + port));
  }
);

req.on('error', (err) => console.error('Request failed:', err.message));
req.write(body);
req.end();
