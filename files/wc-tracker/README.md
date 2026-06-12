# WC 2026 Fantasy Tracker — runbook

Scores the drafted rosters against real World Cup results. Live, free, reuses the
draft's Upstash store.

- **Live:** https://wc-fantasy-2026.vercel.app
- **Vercel project:** `wc-tracker` (team `datakyles-projects`, free Hobby)
- **Source & deploys:** monorepo [datakyle/world-cup-fantasy](https://github.com/datakyle/world-cup-fantasy),
  Vercel **root directory `files/wc-tracker`**. Push to `main` → auto-deploys; branches get previews.
- **Storage:** `internallog` Upstash Redis, key **`wc-tracker-v1`** (separate from the
  draft's `wc-draft-v1` and the scorecard's `scorecard:data`)
- **Results feed:** football-data.org free tier, competition `WC` (104 matches). The free
  tier marks live status (`IN_PLAY`/`PAUSED`) but **scores are delayed a few minutes** —
  real-time livescores need their paid tier; the code is plan-agnostic, so an upgrade needs
  no changes.

## Files

```
index.html       tabbed UI (vanilla, no build): Schedule · Table · Leaderboard
api/_lib.js       team list, football-data→code mapping, KV helpers, scoring + match/group builders
api/tracker.js    GET  — returns the blob (standings + matches + groups + sync meta) for the UI
api/sync.js       GET|POST — pull results, recompute, save (throttled 30s; daily cron)
api/seed.js       POST — freeze draft rosters into the store (token-gated)
vercel.json       cleanUrls + daily cron → /api/sync
```

## Environment variables (set in Vercel)

| Var | Purpose |
|-----|---------|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash (injected by connecting `internallog`) |
| `FOOTBALL_DATA_TOKEN` | football-data.org API token (header `X-Auth-Token`) |
| `SEED_TOKEN` | guards `/api/seed` so only you can overwrite rosters |

## Tabs (`index.html`)

Header reads **WC 2026 Fantasy** (centered, with a "FIFA World Cup 2026" kicker, a status
pill, and a circular ↻ refresh button). Tab order (left→right) is **Schedule · Table ·
Leaderboard**; the app opens on Schedule.

- **Schedule** (default) — full 104-match schedule grouped by local day. Opening the tab
  auto-scrolls to **today** (marked with a green "Today" pill) and stays put across the
  background refresh. Each match shows kickoff time, both teams with the **roster owner**
  of each, and a live/full-time badge. Live and finished games show a **prominent
  scoreboard line** (flags flanking a big score); live cards get a red accent border, a
  red score, and a pulsing **LIVE** badge. The **winning team's row gets a subtle green
  tint + bold name**. Upcoming matches show no score. Knockout fixtures with undetermined
  teams show "TBD / Unowned".
- **Table** — all 12 group tables (flag, team, fantasy owner, live W-D-L record,
  points; top 2 highlighted), followed by the **knockout bracket** — each round
  (R32 → Final + 3rd place) shows its matchups with owners, live/full-time scores and
  the winner emphasized; undrawn rounds read "Set after the group stage". Group records
  are computed server-side (`buildGroups`); the bracket is built client-side from the
  knockout matches in the feed.
- **Leaderboard** — players ranked by total; tap a row to expand the per-team breakdown.
  Ends with a **"How scoring works" card** built from the live `config` (group W/D/L +
  flat knockout bonuses + team/player total rules), shown even before standings exist.

## Auto-refresh (client-side, API-friendly)

The page refreshes itself — no need to tap ↻. One adaptive timer sets its own cadence from
the **scheduled kickoff times** (so it works even on stale data) and **pauses entirely when
the tab is hidden**:

| State (from kickoff times) | Cadence | Calls |
|----------------------------|---------|-------|
| A match in its live window (−5 min to +2.5 h) | every **90s** | real `/api/sync` pull |
| A match within the next hour | every **2 min** | cheap cached `/api/tracker` read |
| Idle (nothing playing) | every **10 min** | cheap cached read (daily cron handles bulk) |

Auto-sync is safe because `/api/sync` self-throttles server-side (see Rate limits below).
The status pill shows **"Live · auto-updating"** during matches; the ↻ button spins while
syncing and still forces an immediate `?force=1` sync on tap.

## Scoring (in `api/_lib.js` → `DEFAULT_CONFIG`)

- Group stage, per match: win 3, draw 1, loss 0 (stacks over the 3 games).
- Knockout bonus — **flat, furthest round only**: R32 +1, R16 +2, QF +4, SF +6,
  **runner-up +7**, champion +8. Edit `config.bonus` to change any value.

## Operations

**Seed / re-seed rosters** (after a (re)draft):
```bash
curl -X POST "https://wc-fantasy-2026.vercel.app/api/seed?token=$SEED_TOKEN"
```
Pulls the live draft, freezes players + rosters. Safe to re-run.

**Force a sync** (normally the client auto-refresh, the ↻ button, or the daily cron
handles it — see Auto-refresh above):
```bash
curl "https://wc-fantasy-2026.vercel.app/api/sync?force=1"
```

**Rate limits (football-data free tier = 10 req/min).** `/api/sync` is the *only*
call that touches the feed, and it's protected three ways:
1. **Soft throttle** — skips the external call if synced < 30s ago (so a flurry of
   Refresh taps collapses to one real request).
2. **Header-aware** — every call reads `x-requests-available-minute` and
   `x-requestcounter-reset` and stores them in `sync.rate`.
3. **Hard cooldown** — a `429` (or burning the last request in the minute) sets
   `sync.cooldownUntil` from the reset header; until it passes, even `?force=1` is
   refused. One sync returns all 104 matches in a single request, so we sit at ~1/min
   in practice against a 10/min ceiling.

## Mapping safety

`/api/sync` returns `sync.unmatched` — any feed team name we couldn't map to a code.
It's currently **empty** (all 48 matched). If a name ever appears there, add an
override in the blob's `overrides.teamByName` (normalized-name → code) and re-sync,
or extend `NAME_ALIASES` in `_lib.js`.

## Don't break the draft

This is a **separate** Vercel project and Redis key. The live draft room
(`wc-draft-room`) is untouched by anything here.
