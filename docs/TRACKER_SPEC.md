# World Cup 2026 Fantasy — Tracker build spec

> **✅ BUILT & LIVE — https://wc-fantasy-2026.vercel.app** (June 11, 2026).
> This document is kept as the design record. Everything below was implemented as
> specified; all open questions from §9 are now resolved (see that section). The
> running source is in `files/wc-tracker/`; the operational runbook is
> [`files/wc-tracker/README.md`](../files/wc-tracker/README.md).

Originally a build spec to make the work mechanical. Decisions locked at design time
are marked ✅.

## 1. What it does

Takes the **frozen draft rosters** (6 players × 8 teams) and the **real WC results**,
and shows a live fantasy leaderboard: each player's score = the combined performance
of their drafted teams.

## 2. Scoring rules ✅ (locked)

Two independent components, summed per player across all of their teams.

### a) Group stage — stacks per match
Each of a team's 3 group matches:
| Result | Points |
|--------|--------|
| Win | 3 |
| Draw | 1 |
| Loss | 0 |

### b) Knockout bonus — FLAT, furthest round only (not cumulative)
A team earns **one** bonus: the value of the deepest round it reaches. Nothing for
earlier rounds.
| Furthest round reached | Bonus |
|------------------------|-------|
| Round of 32 (advanced from group) | +1 |
| Round of 16 | +2 |
| Quarterfinal | +4 |
| Semifinal | +6 |
| **Runner-up (lost final)** | **+7 ⚠️ (see §9 — assumed, confirm)** |
| Champion | +8 |

**Player total** = Σ(group points of all 8 teams) + Σ(knockout bonus of all 8 teams).

**Worked example (from the league rules):** a team that goes 2-0-1 in the group
(2 wins, 1 loss = 6 pts) and reaches the QF (+4 flat) contributes **10**.

> "Reached round X" = the team appears in a match at stage X. Reaching the Round of 32
> means surviving the group, so every team that advances gets at least +1. The
> 3rd-place playoff doesn't change anything: both losing semifinalists already
> "reached SF" → +6 each regardless of who wins it.

## 3. Results data source ✅ (locked: automated free API)

**football-data.org**, free-forever tier.
- Endpoint: `GET https://api.football-data.org/v4/competitions/WC/matches`
  header `X-Auth-Token: <FOOTBALL_DATA_TOKEN>`
- Free tier: **10 req/min**, World Cup included, scores **delayed a few minutes**
  (irrelevant for a fantasy leaderboard). Free competitions are promised free forever.
- Each match gives: `stage` (`GROUP_STAGE`, `LAST_32`, `LAST_16`, `QUARTER_FINALS`,
  `SEMI_FINALS`, `THIRD_PLACE`, `FINAL`), `status` (`FINISHED` etc.),
  `homeTeam`/`awayTeam` (`id`, `name`, `tla`), `score.winner`, `score.fullTime`.
- **Token:** free signup at football-data.org → store as Vercel env `FOOTBALL_DATA_TOKEN`.
  Never in code (same discipline as the draft's Redis token).

**Manual override is still required as a safety valve** even though the source is
automated — see the mapping risk in §7 and the `overrides` field in §5.

## 4. Stack ✅ (locked: reuse the draft pattern)

Same shape as the draft room — static `index.html` + Vercel serverless `api/*` +
the existing **`internallog` Upstash Redis**, new key **`wc-tracker-v1`**.

| Piece | Plan |
|-------|------|
| Vercel project | new `wc-tracker` (free Hobby) — keeps the live draft app untouched |
| Storage | connect the existing `internallog` Upstash store → injects `KV_REST_API_URL/TOKEN` |
| Redis key | `wc-tracker-v1` (separate from `wc-draft-v1` and `scorecard:data`) |
| Extra env | `FOOTBALL_DATA_TOKEN` |
| Auto-refresh | Vercel Cron (free on Hobby) hitting `/api/sync`, or a manual Refresh button |

## 5. Redis data model (`wc-tracker-v1`)

```jsonc
{
  "rev": 1,
  "config": {
    "groupWin": 3, "groupDraw": 1,
    "bonus": { "R32": 1, "R16": 2, "QF": 4, "SF": 6, "RUNNER_UP": 7, "CHAMP": 8 }
  },
  "rosters": {                      // frozen from data/draft-final.json at seed time
    "0": ["ARG","ENG","JPN","PAR","KSA","COD","BIH","UZB"],
    "...": []
  },
  "players": ["Yosia","Jeremiah","Tony","Kyle","Kenneth","Ethan"],
  "overrides": {                    // manual corrections; win over the API if present
    // "FINAL_WINNER": "ARG",       // force champion if the feed lags
    // matchKey: { "hg": 2, "ag": 1, "status": "FINISHED" }
  },
  "sync": { "lastSync": "2026-06-11T20:05:00Z", "ok": true, "matchCount": 104 },
  "standings": [                    // computed each sync, for fast UI render
    { "player": 3, "name": "Kyle", "total": 34, "groupPts": 22, "bonus": 12,
      "teams": [ { "code":"FRA","gW":2,"gD":1,"gL":0,"gPts":7,"round":"QF","bonus":4 } ] }
  ]
}
```

## 6. Endpoints (reuse draft `api/` pattern)

- **`GET /api/tracker`** → returns the blob (`standings`, `sync`, `config`). UI polls it.
- **`POST /api/sync`** (protected) → fetch football-data WC matches → map teams →
  apply `overrides` → compute group pts + flat knockout bonus → write `standings` +
  `sync`. Guard with a secret (`SYNC_TOKEN`) or the commissioner password so it can't
  be spammed; this is the only call that hits the external API.
- **`POST /api/override`** (commissioner) → set/clear an `overrides` entry, then re-sync.
  The manual fallback for any mapping or feed glitch.

## 7. Scoring engine (the core logic in `/api/sync`)

```
1. matches = GET football-data WC matches (status FINISHED only count)
2. map each API team -> our code via TLA, then name, then overrides  (see risk below)
3. group pts:  for each FINISHED GROUP_STAGE match, award 3/1/0 to each side's owner
4. furthest round per team:
     team "reached" a stage if it appears in any match of that stage
     order: GROUP < R32(LAST_32) < R16(LAST_16) < QF < SF < FINAL
     champion = winner of the FINAL match;  runner-up = the FINAL loser
5. knockout bonus per team = flat value of furthest round (RUNNER_UP/CHAMP special-cased)
6. player total = sum(group pts) + sum(bonus) over their 8 teams
7. write standings sorted by total desc (tie-break: see §9)
```

**⚠️ Top risk — team-code mapping.** Our 48 codes come from the draft's `TEAMS` array
(`files/wc-draft-vercel/index.html`); football-data uses its own `tla`/`name`. Most
match, but some won't (e.g. KSA vs SAU, Türkiye/TUR encoding, DR Congo, Ivory Coast,
Czechia). **First build step:** fetch the WC team list once, print our codes beside the
API `tla`+`name`, hand-fill an override map. Without this, owned teams silently score 0.

## 8. UI (`index.html`) — mobile-first, same visual language as the draft

1. **Leaderboard:** players ranked by total, with `groupPts + bonus` split and a
   "last synced" chip (Synced/Stale).
2. **Tap a player →** their 8 teams, each showing group W-D-L, points, furthest round
   reached, and bonus — so every number is auditable.
3. **Refresh** button → calls `/api/sync` (or shows it's on a cron).
4. Optional: "teams still alive" count, a recently-finished match ticker.

## 9. Open questions — ✅ all resolved

1. **Runner-up bonus** → **+7** (locked in `DEFAULT_CONFIG.bonus.RUNNER_UP`).
2. **Standings tie-breaker** → total → group points → name (alphabetical).
3. **Sync cadence** → open, throttled `/api/sync` (30s soft throttle + header-aware
   hard cooldown) driven by the in-app Refresh button, with a daily Vercel cron as a
   backstop. No per-minute cron needed (Hobby caps crons at daily anyway).
4. **Access** → tracker is open read-only via the link; `/api/seed` is token-gated,
   `/api/sync` is open but throttled. (No separate `/api/override` endpoint was built —
   overrides live in the blob's `overrides.teamByName`; not needed since 0 teams unmatched.)

## 10. Build order (✅ completed — kept as the record)

1. Sign up football-data.org → free token. *(5 min)*
2. Build the team-code → API mapping table (§7). *(~20 min)*
3. Scaffold `wc-tracker` Vercel project from the draft pattern; connect `internallog`
   Upstash; set `FOOTBALL_DATA_TOKEN` + `SYNC_TOKEN`. *(~15 min)*
4. `api/sync.js` — fetch + map + score + save (the engine in §7). *(~60 min)*
5. `api/tracker.js` — GET the blob. *(~10 min)*
6. `index.html` — leaderboard + per-player breakdown. *(~90 min)*
7. `python3 tools/snapshot_draft.py` → seed `rosters` from `data/draft-final.json`. *(~10 min)*
8. (Optional) Vercel Cron → `/api/sync`. *(~15 min)*
9. Deploy, run one sync, eyeball standings against a known result. Done before kickoff.

## 11. Inputs already in place

- `data/draft-final.json` — frozen rosters (re-run `tools/snapshot_draft.py` once the
  last 2 picks land; it flags `_complete`).
- Team list / codes / groups / flags — reuse the `TEAMS` array from the draft's
  `index.html` (don't redefine it).
- Draft system reference — `docs/DRAFT.md`.
