# World Cup 2026 Fantasy League

A 6-player fantasy pool: each player drafts 8 of the 48 WC 2026 teams, then scores
based on how those teams do in the real tournament.

## Two parts

| Part | Status | Where |
|------|--------|-------|
| **Draft room** — pick the teams | ✅ live at https://wc-draft-room.vercel.app | `files/wc-draft-vercel/` · docs: [`docs/DRAFT.md`](docs/DRAFT.md) |
| **Tracker** — score the tournament | ✅ live at https://wc-fantasy-2026.vercel.app | `files/wc-tracker/` · runbook: [`files/wc-tracker/README.md`](files/wc-tracker/README.md) · spec: [`docs/TRACKER_SPEC.md`](docs/TRACKER_SPEC.md) |

## Repo layout

```
README.md                 you are here
docs/
  DRAFT.md                draft system: hosting, API, data model, how to read rosters
  TRACKER_SPEC.md         full build spec for the tracker (scoring, data source, plan)
data/
  draft-final.json        frozen rosters — the tracker's input (re-freeze when draft ends)
tools/
  snapshot_draft.py       re-freeze data/draft-final.json from the live draft
files/
  wc-draft-vercel/        deployed draft room source (live — don't redeploy casually)
  wc-tracker/             deployed tracker source (live — has its own README)
draftping.py              (unused) on-the-clock iMessage notifier — not scheduled
```

## Operating the live apps

Both apps are built and live — free Vercel Hobby projects sharing the `internallog`
Upstash Redis (separate keys, zero collision).

- **Tracker** → https://wc-fantasy-2026.vercel.app — seed/sync/rate-limit ops in
  [`files/wc-tracker/README.md`](files/wc-tracker/README.md). Tabs: Schedule · Table · Leaderboard.
- **Draft room** → https://wc-draft-room.vercel.app — see [`docs/DRAFT.md`](docs/DRAFT.md).
- **Re-freeze rosters** (only if the league re-drafts): `python3 tools/snapshot_draft.py`.

## Locked decisions

- **Scoring:** group W/D/L = 3/1/0 (stacks per match) + a **flat** knockout bonus for
  the furthest round reached (R32 +1, R16 +2, QF +4, SF +6, runner-up +7, champ +8).
- **Results source:** football-data.org free tier (`WC` competition).
- **Stack:** reuse the draft pattern — Vercel + the existing `internallog` Upstash
  Redis, new key `wc-tracker-v1`.
