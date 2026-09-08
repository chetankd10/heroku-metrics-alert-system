# Heroku Metrics Alert System

Monitors dyno, Postgres, Redis, and Kafka metrics for one or more Heroku
apps by receiving each app's log drain, parsing the `sample#key=value`
metric lines Heroku and its add-ons emit, storing them in Postgres, and
raising threshold alerts on a dashboard.

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
4. The `/` dashboard polls `/api/metrics/latest`, `/api/alerts`, and
   `/api/metrics/history` every 10s to render a line chart per
   resource/source/metric series (range selector from 15m up to 90 days,
   plus a "Custom..." option with From/To date-time pickers, via
   Chart.js), plus current values and recent threshold breaches.
   Breaches are also logged to the dyno's console (`console.warn`).
   A dyno dropdown (populated from `/api/dynos`) filters the dyno-type
   charts down to one instance (`web.1`, `web.2`, ...) at a time; it has
   no effect on Postgres/Redis/Kafka charts, which aren't tied to a dyno.
   Longer ranges are downsampled server-side (time-bucketed averages,
   ~300 points per series) so a 90-day chart costs about the same to
   query and render as a 15-minute one. A custom range is capped at a
   90-day span (matching the preset max) and, once applied, stays fixed
   at that From/To window on subsequent 10s polls rather than sliding
   forward with "now".

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
   attach the drain, including a `?app=<name>` param that identifies
   which app the payload came from (Heroku's syslog `APPNAME` field is
   always just the literal string `app`/`heroku`, so this query param is
   the only reliable way to tell apps apart on a shared drain endpoint):
   ```bash
   heroku labs:enable log-runtime-metrics -a your-monitored-app
   heroku drains:add \
     "https://your-alert-system-app.herokuapp.com/log-drain?token=<DRAIN_TOKEN>&app=your-monitored-app" \
     -a your-monitored-app
   ```
4. If the monitored app has Postgres/Redis/Kafka add-ons, check that
   add-on's docs for how to enable metrics logging (some emit metrics by
   default once a drain is attached; some require a plan tier or a
   `heroku <addon>:` config command).

## Monitoring more than one app

A single deployment of this service can monitor any number of Heroku
apps at once:

1. Repeat step 3 above for every additional app, each with its own
   `?app=<name>` value (they can all point at the same
   `your-alert-system-app.herokuapp.com/log-drain` URL and share the same
   `DRAIN_TOKEN`). `MONITORED_APP_NAME` only matters as a fallback label
   for a drain hit that omits `?app=`, so you don't need to change it
   when adding more apps.
2. The dashboard's **App** dropdown lists every app that has sent data
   (grouped under "Monitored"), plus — if `HEROKU_API_KEY` is set — every
   other app your account/teams can see, grouped as "Personal (not
   monitored)" or "Team: &lt;name&gt; (not monitored)", as a reminder of
   what you could add a drain for next. Selecting an app filters every
   panel (charts, dyno list, latest metrics, alerts) to just that app;
   the default "All monitored apps" view shows everything together, with
   an "App" column on each table and series label.
3. To enable the "not monitored" discovery groups, set `HEROKU_API_KEY`
   to a Heroku OAuth token. Mint one scoped to **read-only** so this
   service can never modify any app, including ones it doesn't monitor:
   ```bash
   heroku authorizations:create --scope read -d "your-alert-system-app read-only API discovery"
   heroku config:set HEROKU_API_KEY=<token from the previous command> -a your-alert-system-app
   ```
   This service only ever issues `GET` requests against the Heroku
   Platform API (just to list apps) — it never attaches, removes, or
   otherwise writes to a log drain or any other app setting on your
   behalf. Attaching drains (step 3 above) is always a manual step you
   run yourself. If `HEROKU_API_KEY` is unset, app discovery is skipped
   entirely and the dropdown only shows apps that already have data.

## Tuning alerts

Edit `src/alertRules.js` — each rule matches a `resourceType` and a
`metricName` pattern, and fires when the value crosses `threshold` in
the given `operator` direction. Defaults are illustrative; adjust to your
dyno size and workload.

## Data retention

Raw metric rows are pruned on a daily timer (and once at boot) to keep
Postgres storage bounded even with the 90-day dashboard range. Default
retention is 95 days (5 days of slack past the longest selectable range);
override with the `RETENTION_DAYS` config var. Storage still grows with
the number of monitored metrics/sources between prunes, so a very busy
app or add-on tier that emits many distinct `sample#` keys will use more
space than a quiet one — lower `RETENTION_DAYS` if that becomes an issue.

## Known limitations

- `npm audit` flags a moderate `qs` advisory pulled in transitively by
  Express 4's `body-parser`. No fixed release exists yet upstream; this
  app only reads `req.query.token` as a plain string, so the vulnerable
  nested-object parsing path isn't reachable here.
- No push notifications (Slack/email) — the dashboard and dyno logs are
  the only alert surface, by design for this iteration.
- If this app is scaled to 0 dynos (or otherwise unreachable) for an
  extended period, Heroku can silently detach the HTTPS log drain on the
  monitored app after repeated delivery failures. If dynos/metrics stop
  updating after downtime, check `heroku drains -a <monitored-app>` and
  re-add the drain (see "Deploying and wiring up the real log drain")
  rather than assuming it's a code issue.
