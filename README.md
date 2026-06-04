# Ballchasing Desktop

A desktop client for [ballchasing.com](https://ballchasing.com) built **entirely on the public REST
API** and authenticated with your **personal API key** — no Steam login. Electron + React +
TypeScript (Vite). See [`FEATURES.md`](./FEATURES.md) for the full feature spec.

## What's implemented

- **API-key-only sign-in** (`KeyGate`) — validated via the ping endpoint, stored **encrypted** on
  device with Electron `safeStorage`. The key never leaves the main process.
- **Rate-limit-aware scheduler** — every API call goes through one shared queue that respects your
  patron tier's requests/sec and backs off on HTTP 429. The live **rate meter** (top-right) shows
  tier, budget, and active/queued counts.
- **TTL cache + stale-while-revalidate** — replays, groups, and stats are cached in the main
  process; views render instantly from cache and refresh in the background.
- **Group tree** (`GroupTree`) — lazy-expanding folder tree with **smart background prefetch** of
  child branches, **drag-and-drop re-parenting** (Explorer-style), and inline create / rename /
  delete.
- **Group stats** (`GroupDetail`) — Players, Teams, and Replays tabs with a per-game ↔ cumulative
  toggle. Every numeric cell is **heat-tinted** per column (direction-aware: "bad" stats like demos
  taken / time at 0 boost tint red when high). Toggle with **Heat tint** in the top bar.
- **Replay browser** (`ReplayBrowser`) — filter by player, playlist, season, result, rank range,
  uploader, date range, sort.
- **Automatic series recognition** (`lib/series.ts`) — any replay list is scanned for series
  (same rosters + playlist + close in time, best-of-N aware). A banner offers **Select series** and
  **Create replay group**, with suggested names where the **user's own team leads the score** (e.g.
  `SAN 1-3 DEN`), falling back to the **winner** leading if the user didn't play. Extra dated and
  `(BoN)` suggestions included.
- **Replay detail** (`ReplayDetail`) — full per-player scoreboard across core/boost/movement/
  positioning/demo, heat-tinted, with MVP marker; polls while a replay is still processing.

## Run it

```bash
npm install      # already done if node_modules exists
npm run dev      # Vite dev server + Electron with hot reload + devtools
# or a production-style run:
npm run build && npm start
```

On first launch, paste a ballchasing API key (get one at ballchasing.com → Upload & API).

## Releases & auto-update

- Installers are published on the [GitHub Releases](https://github.com/hudayy/ballchasing-desktop/releases)
  page. Download the latest `BallchasingDesktop-<version>-setup.exe` and run it.
- The app **auto-updates**: on launch (and every 6 hours) it checks the latest GitHub Release via
  `electron-updater`, downloads the new installer in the background, and prompts to restart — which
  replaces the installed app automatically. A version badge in the top bar shows update status and
  can trigger a manual check.
- **Cutting a release:** bump `version` in `package.json`, commit, then push a matching tag:
  ```bash
  git tag v0.2.0 && git push origin v0.2.0
  ```
  The `.github/workflows/release.yml` GitHub Action builds the Windows installer and publishes the
  release (installer + `latest.yml` + blockmap) automatically. To build an installer locally instead:
  `npm run dist` (output in `release/`).

## Notes / API constraints

- The API has **no native "series", leaderboard, or player-profile** concept — series detection is
  fully client-side over the replay list.
- **Drag-to-reparent** issues a `PATCH /groups/{id}` with a new `parent`. If ballchasing rejects
  changing a group's parent, the app surfaces the error and reloads — no data is lost.
- The tree assumes a bare `GET /groups?creator=me` returns top-level groups and
  `?group=<id>` returns direct children. Adjust `GroupTree.loadChildren` if your account's behavior
  differs.
- Upload uses `POST /v2/upload` (multipart). Drag-and-drop upload UI is scaffolded in the API layer
  (`window.api.uploadReplay`) and can be wired to a button/drop-zone next.

## Project layout

```
electron/main.cjs      # window, key storage, scheduler, cache, IPC, API client
electron/preload.cjs   # contextBridge -> window.api
src/lib/               # heat tinting, stat flattening, series detection, normalize
src/components/        # KeyGate, RateMeter, GroupTree, GroupDetail, StatTable,
                       # ReplayList, ReplayBrowser, ReplayDetail, SeriesModal
src/App.tsx            # layout + routing between views
```
