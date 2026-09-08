# Heroku Metrics Alert System

Monitors dyno, Postgres, Redis, and Kafka metrics for a Heroku app by
receiving that app's log drain, parsing the `sample#key=value` metric
lines Heroku and its add-ons emit, storing them in Postgres, and raising
threshold alerts on a dashboard.

## How it works

1. Heroku's **Log Runtime Metrics** (dyno load/memory) and add-on metric
   logging emit lines like:
   ```
   source=web.1 sample#load_avg_1m=0.02 sample#memory_total=105.66MB
   source=HEROKU_POSTGRESQL_NAVY sample#active-connections=5 sample#load-avg-1m=0.10
   ```
2. A **log drain** streams your monitored app's logs as an HTTPS POST to
   this service's `/log-drain` endpoint.
3. This service parses each `sample#...` pair, classifies it by source
   (`dyno`, `postgres`, `redis`, `kafka`, `other`), stores it in Postgres,
   and checks it against the thresholds in `src/alertRules.js`.
4. The `/` dashboard polls `/api/metrics/latest` and `/api/alerts` every
   10s to show current values and recent threshold breaches. Breaches are
   also logged to the dyno's console (`console.warn`).

Exact metric names/units vary by add-on and plan — the parser stores
whatever `sample#key=value` pairs are present rather than hardcoding an
exhaustive list, so unrecognized metrics still show up on the dashboard
even if no alert rule matches them yet.

## Local development

```bash
npm install
createdb heroku_metrics_dev
cp .env.example .env   # edit DATABASE_URL to point at heroku_metrics_dev
npm start
```

In another terminal, simulate a log drain payload without deploying:

```bash
npm run simulate
```

Then open http://localhost:3000 to see the dashboard populate.

Run the unit tests (log frame parsing, metric extraction, alert rules):

```bash
npm test
```

## Deploying and wiring up the real log drain

1. Deploy this app to Heroku (it provisions `heroku-postgresql` via
   `app.json` if you use the Deploy button, or `heroku create` + `git
   push heroku main` otherwise).
2. Set config vars:
   ```bash
   heroku config:set DRAIN_TOKEN=$(openssl rand -hex 20) -a your-alert-system-app
   heroku config:set MONITORED_APP_NAME=your-monitored-app -a your-alert-system-app
   ```
3. On the **app you want to monitor**, enable dyno metric logging and
   attach the drain:
   ```bash
   heroku labs:enable log-runtime-metrics -a your-monitored-app
   heroku drains:add \
     "https://your-alert-system-app.herokuapp.com/log-drain?token=<DRAIN_TOKEN>" \
     -a your-monitored-app
   ```
4. If the monitored app has Postgres/Redis/Kafka add-ons, check that
   add-on's docs for how to enable metrics logging (some emit metrics by
   default once a drain is attached; some require a plan tier or a
   `heroku <addon>:` config command).

## Extending to a whole team/account

This starter targets a single named app. To cover every app in a
Heroku team, add a script that calls the [Platform API](https://devcenter.heroku.com/articles/platform-api-reference)
(`GET /teams/{team}/apps`, then `POST /apps/{app}/log-drains` for each) to
attach this same drain URL/token to every app, and tag incoming metrics
by the syslog `appName` field (currently only used for display) instead
of the single `MONITORED_APP_NAME` env var.

## Tuning alerts

Edit `src/alertRules.js` — each rule matches a `resourceType` and a
`metricName` pattern, and fires when the value crosses `threshold` in
the given `operator` direction. Defaults are illustrative; adjust to your
dyno size and workload.

## Known limitations

- `npm audit` flags a moderate `qs` advisory pulled in transitively by
  Express 4's `body-parser`. No fixed release exists yet upstream; this
  app only reads `req.query.token` as a plain string, so the vulnerable
  nested-object parsing path isn't reachable here.
- No push notifications (Slack/email) — the dashboard and dyno logs are
  the only alert surface, by design for this iteration.
