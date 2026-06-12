# World Cup 2026 Fantasy — Draft Room (system docs)

The draft is the **input** to the tracker. This documents what was built, where it
lives, and exactly how to read the final rosters out of it.

## Live app

- **URL:** https://wc-draft-room.vercel.app
- **What it does:** mobile-first async snake draft. 6 players, 8 teams each, 48 of
  the 48-team field drafted. Picks sync live across phones; commissioner can undo /
  swap / roll back.
- **Source:** `files/wc-draft-vercel/` (`index.html` + `api/draft.js` + `package.json`).
  ⚠️ This app is **live**. Do not redeploy or edit it without intent.

## Hosting & storage

| Piece | Value |
|-------|-------|
| Vercel project | `wc-draft-room` (team `datakyles-projects`, free Hobby plan) |
| Storage | Upstash Redis store **`internallog`** (shared, free tier) |
| Redis key | `wc-draft-v1` (one JSON blob) |
| Env vars on Vercel | `KV_REST_API_URL`, `KV_REST_API_TOKEN` (injected by the Upstash connection; `api/draft.js` also accepts `UPSTASH_REDIS_REST_*`) |

> The same `internallog` Redis also backs the Internal Scorecard app under key
> `scorecard:data`. Different keys → zero collision. The tracker will add a **third**
> key, `wc-tracker-v1`, to the same store.

## API

`GET /api/draft` → `{ "state": <blob|null> }`
`POST /api/draft` with `{ "state": {...} }` → saves · `{ "reset": true }` → clears.

## Data model (`state` blob)

```jsonc
{
  "rev": 49,                       // bumped on every save; tracker polls this for changes
  "started": true,
  "players": ["Yosia","Jeremiah","Tony","Kyle","Kenneth","Ethan"],  // index = playerId
  "slots": 8,                      // teams per player
  "order": [3,5,4,2,0,1],          // round-1 pick order (playerIds); even rounds reversed (snake)
  "picks": [
    { "n": 1, "player": 3, "team": "FRA" },   // n = overall pick #, player = index into players[], team = code
    { "n": 2, "player": 5, "team": "MEX" }
    // … up to players*slots = 48
  ]
}
```

- **Team codes** are FIFA-style 3-letter codes defined in `files/wc-draft-vercel/index.html`
  (the `TEAMS` array — code, full name, group A–L, flag emoji). This is the canonical
  team list for the whole project; the tracker reuses it.
- A player's roster = every `pick.team` where `pick.player == playerId`.

## Final rosters (COMPLETE — 48/48, snapshot rev 51)

| Player | Teams |
|--------|-------|
| Yosia | ARG, ENG, JPN, PAR, KSA, COD, BIH, UZB |
| Jeremiah | NED, GER, CRO, AUS, PAN, NZL, HAI, QAT |
| Tony | BRA, POR, SUI, URU, EGY, GHA, SCO, TUN |
| Kyle | FRA, COL, NOR, ECU, TUR, CIV, KOR, CUW |
| Kenneth | ESP, BEL, MAR, SEN, AUT, CZE, RSA, JOR |
| Ethan | MEX, USA, SWE, CAN, ALG, IRN, IRQ, CPV |

## Freezing the rosters for the tracker

The draft stays editable until the league is done. Capture the final state:

```bash
python3 tools/snapshot_draft.py     # writes data/draft-final.json
```

The draft is now complete, so `data/draft-final.json` is frozen at all 48 picks
(`_complete: true`). Only re-run this if the league re-drafts (it flags `_complete: false` until
all 48 are in). The tracker should load `data/draft-final.json` as its roster source
of truth so live draft edits can't retroactively change scoring.
