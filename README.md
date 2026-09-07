# TrackT

Real-time MBTA departures with context: live delays, service alerts, historical
delay baselines, and crowd forecasts from nearby events — for every subway,
commuter rail, bus and ferry line. A 3D network map (three.js) shows vehicles
moving along their routes in real time.

## Running locally

```bash
npm install
cp .env.example .env.local   # then add your keys
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MBTA_API_KEY` | Recommended | Raises the MBTA V3 API limit from 20 to 1,000 requests/min. Free at https://api-v3.mbta.com/portal |
| `TICKETMASTER_API_KEY` | Optional | Enables concerts, theatre and other events in the crowd forecast. Free at https://developer.ticketmaster.com |

Red Sox, Bruins and Celtics games are pulled from public league feeds and need no key.

## Architecture

- `app/` — Next.js App Router. `/` is the three-step picker (mode → line → stop); `/stop/[line]/[stop]` is the departure dashboard.
- `app/api/mbta/*` — thin server routes that proxy the MBTA V3 API (keeps the key server-side, normalises responses, sets cache headers).
- `components/map3d/` — the WebGL map. `engine.ts` owns the scene, camera, route lines, stop markers and dead-reckoned train animation; `tiles.ts` streams the Esri dark-canvas basemap onto the ground plane.
- `lib/lines.ts` — the catalogue of lines, colours and MBTA route ids. Add a line here and it appears everywhere.
- `data/gl-historical-baselines.json` — per-stop, per-hour delay baselines (Green Line) built by `scripts/process-lamp-data.py` from MBTA LAMP data.

## Notes for development

- The basemap is Esri's World Dark Gray Canvas, which is free with attribution and needs no key.
- If this checkout lives inside an iCloud-synced folder (Desktop/Documents with *Optimize Mac Storage* on), keep dependencies out of iCloud: `node_modules` is a symlink to `node_modules.nosync`, which iCloud ignores. Evicted files inside `node_modules` otherwise stall the dev server on every read.
