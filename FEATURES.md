# Ballchasing Desktop — Comprehensive Feature List

A desktop client built entirely on the **ballchasing.com REST API**, authenticated with the
user's personal API key (no Steam login). This document is the master feature spec, organized in
three parts:

1. **Parity features** — everything ballchasing.com does today, re-implemented for desktop, with
   small improvements folded into each description.
2. **Quality-of-life additions** — new ideas that stay strictly within what the API allows.
3. **Requested features** — your six features, with minor improvements baked in.

Throughout, **(API)** notes the endpoint(s) a feature relies on, and **(client-side)** flags logic
the app must compute itself because the API has no native concept for it.

---

## Part 1 — Feature parity with ballchasing.com (improved)

### 1.1 Authentication & account
- **API-key-only sign-in.** Paste a ballchasing API key once; the app validates it via `GET /`
  (ping) and stores it in the OS credential vault (Windows Credential Manager / macOS Keychain /
  libsecret), never in plaintext. Improvement: show the detected **patron tier** (GC / Champion /
  Diamond / Gold / Regular) and the resulting **rate limits**, so the user understands how fast the
  app can fetch. Support **multiple saved keys** with quick switching (e.g. personal vs. org key).
- **Live rate-limit meter.** A small status-bar widget shows requests used vs. the per-second and
  per-hour budget for the current tier, since limits differ per endpoint. Improvement over the
  website, which exposes none of this.

### 1.2 Uploading replays (`POST /v2/upload`)
- **Drag-and-drop upload** of one or many `.replay` files, with a queue, per-file progress, and
  retry on failure.
- **Visibility selector** per upload or per batch: public / unlisted / private.
- **Upload straight into a group** via the `group` parameter, so files land in the right folder
  immediately.
- **Duplicate handling.** The API returns `409` for duplicates; the app surfaces "already uploaded"
  and links to the existing replay instead of treating it as an error.
- **Watch-folder auto-upload (improvement).** Optionally monitor the Rocket League replay folder
  (or a BakkesMod export folder) and auto-upload new replays with a chosen default visibility/group
  — a desktop-only convenience the website can't offer.

### 1.3 Replay browser / "My Replays" (`GET /replays`)
A filterable, sortable, paginated table of replays. Every documented filter is exposed as a proper
UI control:
- **Title** search.
- **Player name** and **player ID** (`platform:id`) filters, both repeatable (filter by several
  players at once).
- **Playlist** picker (ranked/unranked duels, doubles, standard, plus tournament/extra modes).
- **Season** picker (numbered seasons and free-to-play `f1…fN`).
- **Match result** (win / loss).
- **Min/max rank** range (Bronze 1 → SSL/Grand Champion).
- **Pro-only** toggle.
- **Uploader** (`me` or a SteamID64).
- **Group** filter (direct replays of a group).
- **Date ranges**: by upload date (`created-before/after`) and by in-game match date
  (`replay-date-before/after`), each with a calendar picker.
- **Map** filter.
- **Sorting** by replay date or upload date, ascending/descending.
- **Cursor pagination** using the API's `next` link, with infinite-scroll or page buttons.

Per-row display: title, map, playlist, duration, overtime flag, season, date, visibility, uploader,
the team scoreboard summary, and which groups the replay belongs to.

Improvements:
- **Saved filter presets** ("Ranked 3s this season, wins only") with one-click recall.
- **Column chooser** and persistent column widths.
- **Multi-select with bulk actions**: add to group, change visibility (`PATCH /replays/{id}`),
  delete (`DELETE /replays/{id}`), or download files — all respecting rate limits via a throttled
  queue.

### 1.4 Replay detail view (`GET /replays/{id}`)
Full single-match breakdown, mirroring the website's replay page and its stat groupings. Handles the
`pending` / `ok` / `failed` processing states gracefully (auto-polls while pending).

- **Scoreboard** per team (blue/orange, with names): each player's **core** stats — goals, assists,
  saves, shots, score, shooting %, and the **MVP** marker.
- **Boost tab**: BPM, BCPM, average boost amount, time at 0 boost, time at 100 boost, amount
  collected, amount stolen, big/small pads collected, overfill, time using boost, etc.
- **Movement tab**: average speed, total distance, time supersonic / boost-speed / slow, time on
  ground / low air / high air, powerslide count and duration.
- **Positioning tab**: time in defensive vs. offensive half, time in defensive/neutral/offensive
  third, time behind vs. in front of ball, average distance to ball (and to teammates/mates),
  time as most-back / most-forward player, and goals-against-while-last-defender.
- **Demo tab**: demos inflicted and taken per player.
- **Per-player metadata**: car name/ID, camera settings (FOV, height, angle, distance, stiffness,
  swivel/transition speed), steering sensitivity, and time on field (start/end, substitutions).
- **Match metadata**: map, playlist, duration, overtime length, season, date, uploader.

Improvements:
- **Side-by-side player comparison** within the match (pick two players, diff every stat).
- **Per-stat "team share" bars** so you can see, e.g., who collected what fraction of the team's
  boost at a glance.
- **Copy-as-image / copy-as-table** for any stat panel for quick sharing.

### 1.5 Groups / folders (`GET /groups`, `GET /groups/{id}`)
- **Group list** filterable by name, creator (`me` or SteamID64), parent group, and creation date,
  sortable by name or creation date.
- **Group detail** with the website's tabs:
  - **Replays** in the group.
  - **Players stats** — every player aggregated across all replays in the group (and, per the
    website's behavior, its subgroups), with `cumulative` totals (games, wins, win %, play time)
    and `game_average` per-match values across core/boost/movement/positioning/demo.
  - **Teams stats** — the same aggregation rolled up by team.
  - **General / overview** — counts of direct vs. indirect replays, identification settings,
    sharing state.
- **Cumulative ↔ per-game-average toggle** on every stat table.
- **Group settings**: `player_identification` (by-id / by-name) and `team_identification`
  (by-distinct-players / by-player-clusters), editable via `PATCH /groups/{id}`.
- **Create / rename / delete** groups (`POST` / `PATCH` / `DELETE /groups`), including creating a
  group with a **parent** for nesting.
- **Sharing**: surface the public group link and `shared` flag for easy copy/paste.

Improvements:
- **CSV / Excel / JSON export** of any players-stats or teams-stats table.
- **Column heat-tinting** on every stat table (see Part 3, feature 6).
- **"Compare two groups" view** (e.g. this week vs. last week) showing per-player stat deltas.

### 1.6 Reference & discovery
- **Maps reference** (`GET /maps`): browse map codes/names, used to power the map filter with real
  thumbnails/names instead of raw codes.
- **Player lookup**: jump from any player in a scoreboard to a filtered replay list for that
  `player-id` (their appearances across your accessible replays).

---

## Part 2 — Quality-of-life additions (within the API)

- **Aggressive local cache + offline mode.** Persist every fetched replay, group, and stat blob in a
  local database (SQLite). Re-opening the app shows cached data instantly and works offline; fetches
  only hit the API to refresh stale entries. Critical because the API is rate-limited per tier.
- **Smart prefetch / background sync.** A throttled background worker that respects the live
  rate-limit budget, refreshing recently-viewed groups and queuing child-group fetches before the
  user needs them (ties directly into feature 3 below).
- **Global request scheduler with backoff.** All endpoints share one rate-limit-aware queue that
  auto-throttles, handles `429` with exponential backoff, and shows queued/in-flight counts — so
  bulk operations never get the key temporarily blocked.
- **Cross-group / cross-replay stat search.** "Find every replay where I had >2 demos taken" or
  "games on DFH Stadium where we lost in OT," computed client-side over cached replay detail.
- **Personal trend dashboards.** Charts of any stat (BPM, shooting %, saves, time-behind-ball, etc.)
  over time, per playlist, built from cached replay/group data — your own progression view.
- **Snapshot diffing.** Save a group's stat table as a dated snapshot and diff later to track
  improvement, even if replays are added/removed.
- **Bulk re-tagging & cleanup tools.** Multi-select replays to mass-assign groups or change
  visibility; find orphaned/ungrouped replays; find empty groups.
- **Export & reporting.** One-click CSV/Excel/JSON/Markdown export of any table or comparison, plus a
  "scrim report" generator that compiles a group's series results and key stats into a shareable
  summary.
- **Keyboard-first navigation.** Command palette (Ctrl/Cmd-K) to jump to any group/replay, plus
  shortcuts for create-group, upload, refresh, and tree navigation.
- **Theming & density.** Light/dark themes and compact/comfortable table density; remembered window
  layout.
- **Notifications.** Desktop toast when a queued upload finishes processing (`pending` → `ok`) or a
  background sync completes.

---

## Part 3 — Requested features (improved)

### 3.1 Automatic series recognition + one-click group creation
Because the API has **no native "series" concept** (replays only carry teams, players, date, and
playlist), the app detects series **client-side** by clustering a set of replays that share the same
two team rosters (using the group's player/team identification), the same playlist, and tight
temporal proximity (consecutive match dates within a small gap). Improvement: also respect
best-of-N boundaries — stop a series once one side reaches the clinching win count (Bo3 → 2,
Bo5 → 3, Bo7 → 4), and let the user adjust the detected boundaries before committing.

- **One-button "select whole series."** From any replay in a detected series, a single click selects
  every game in that series.
- **One-click group creation** from the selection (`POST /groups`, then `PATCH` each replay into it).
- **Auto-suggested group names (improved).** The app proposes **at least two** names derived from the
  team names in the replays and the computed series score, e.g. for SAN vs. DEN:
  - `SAN vs DEN`
  - `SAN 3-0 DEN` (score reflects the actual series result)

  Improvements to the suggestions:
  - Order the score so the **user's own team leads** (the team the signed-in player played on),
    e.g. `SAN 1-3 DEN` if the user was on SAN. If the user did **not** play in the series, fall back
    to letting the **winning team lead** (e.g. `DEN 3-1 SAN`). The user is identified by matching the
    API-key owner's `steam_id`/player-id (from `GET /`) against the rosters.
  - Offer a **dated variant** (`SAN vs DEN — 2026-06-03`) and a **best-of label**
    (`SAN vs DEN (Bo5)`) as extra options, since multiple series between the same teams are common.
  - All suggestions are editable before creation, and the chosen format is remembered as the default.

### 3.2 Tree-structured groups page
Groups render as an **expandable tree** (like a file explorer). Expanding a node reveals its child
groups indented beneath it; expanding those reveals theirs, recursively — built on the API's
parent/child group nesting (`GET /groups?group={parentId}`).
- Each node shows quick badges: direct vs. indirect replay counts and (when cached) headline stats.
- Improvement: **lazy expansion with persistent expand/collapse state**, breadcrumb path for the
  selected node, and inline create-subgroup / rename / delete actions on each node.

### 3.3 Cache + smart background loading for the tree
The tree must never block on per-group fetches.
- **Instant render from cache**, then refresh in the background.
- **Predictive child prefetch.** When a node is visible or hovered, its children are fetched ahead of
  time through the shared rate-limit-aware scheduler, so expanding the next branch is instant.
- **Skeleton placeholders** for not-yet-loaded branches, with stale-while-revalidate semantics
  (show cached data immediately, quietly update when fresh data arrives).
- Improvement: a configurable **prefetch depth** (e.g. preload 2 levels ahead) tuned automatically to
  the current rate-limit budget so it never starves user-initiated requests.

### 3.4 API-key-only, no Steam login
The entire app authenticates with **only the ballchasing API key** via the `Authorization` header;
there is no Steam OAuth anywhere. (Covered in 1.1 — listed here to confirm it as a hard requirement.)
Improvement: graceful handling of an invalid/expired key (clear re-entry prompt) and a read-only
"limited" mode if a key lacks upload permissions.

### 3.5 Drag-and-drop groups into one another (Explorer-style)
Reorganize the group tree by **dragging a group onto another group** to re-parent it, exactly like
moving folders in Windows Explorer.
- Implemented by updating the dragged group's parent (`PATCH /groups/{id}`), with optimistic UI and
  rollback if the request fails.
- Also support **dragging replays into a group** node (`PATCH /replays/{id}`).
- Improvement: multi-select drag, a drop-indicator showing the target parent, a confirmation when a
  move would re-aggregate large stat sets, and **undo** for the last move.

### 3.6 Heat-tinted stat cells
In every stat table (replay scoreboard, group players-stats, teams-stats), each cell is **tinted on a
color scale reflecting how high that value is relative to the other values in the same column**, so
the eye instantly finds the best/worst in each metric.
- Per-column normalization (min→max within the visible column), with a diverging or sequential color
  ramp.
- Improvements:
  - **Direction-aware coloring** — for "bad" stats (e.g. demos taken, time at 0 boost,
    goals-against-as-last-defender) high values tint red instead of green, so color always means
    "good → bad" consistently.
  - **Configurable scope**: normalize within the column, within a team, or against a saved baseline
    (e.g. your season average), toggleable per table.
  - **Colorblind-safe palettes** and an option to switch tint to a small in-cell bar for
    accessibility.

---

## Appendix — API constraints worth designing around
- **No series, no leaderboards, no player-profile endpoints** in the API: series detection (3.1) is
  fully client-side; any leaderboard/profile views must be assembled from `/replays` + `/groups`.
- **Group stats are only available per-group**, so cross-group comparisons (Part 2) are computed by
  fetching and merging multiple group payloads.
- **Rate limits are tier-dependent and per-endpoint**, which is why caching (2), a shared scheduler
  (2), and prefetch tuning (3.3) are core architecture, not nice-to-haves.
- **Group `direct` vs. `indirect` replays**: the `/replays?group=` filter returns only direct
  replays, while `GET /groups/{id}` aggregates across the subtree — the app must use the right source
  for each view.
