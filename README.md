# TrackT

Real-time MBTA departures with context: live delays, service alerts, historical
delay baselines, and crowd forecasts from nearby events — for every subway,
commuter rail, bus and ferry line. The whole app is a fullscreen, game-style 3D
city (three.js) with live trains gliding along their routes; pickers, search and
stop dashboards float over it as windows that expand from whatever you clicked.

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

- `app/` — Next.js App Router. The root layout mounts the map (`components/MapStage.tsx`) and the search HUD once, so they persist across navigation; the map reads what to show from the URL. `/` floats the picker window (mode → line → stop); `/stop/[line]/[stop]` floats the departure dashboard.
- `components/Window.tsx` — the floating panel: grows out of the click/search origin, docks left or right on desktop (bottom sheet on phones), minimizes, and reserves its footprint via `lib/mapBus.ts` so the camera recenters in the free space.
- `app/api/mbta/*` — thin server routes that proxy the MBTA V3 API (keeps the key server-side, normalises responses, sets cache headers).
- `components/map3d/` — the WebGL map. `engine.ts` owns the camera, route lines, stations, labels, toy trains (dead-reckoned between polls; click one to follow it) and renders in three passes: flat ground, lit buildings, then the transit layer on top. `tiles.ts` streams OpenFreeMap vector tiles; `tile.worker.ts` meshes them off the main thread into flat colored ground and extruded buildings.
- `lib/lines.ts` — the catalogue of lines, colours and MBTA route ids. Add a line here and it appears everywhere.
- `data/gl-historical-baselines.json` — per-stop, per-hour delay baselines (Green Line) built by `scripts/process-lamp-data.py` from MBTA LAMP data.

## Notes for development

- The basemap is built from OpenFreeMap vector tiles (OpenMapTiles schema, OpenStreetMap data): free with attribution, no key. Buildings only exist at z14, so they stream in when the camera is close.
- If this checkout lives inside an iCloud-synced folder (Desktop/Documents with *Optimize Mac Storage* on), keep dependencies out of iCloud: `node_modules` is a symlink to `node_modules.nosync`, which iCloud ignores. Evicted files inside `node_modules` otherwise stall the dev server on every read.
