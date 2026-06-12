# World Cup Draft Room — deploy to Vercel

A mobile-first async snake-draft board for the World Cup 2026 fantasy league. Picks sync across everyone's phones through a tiny serverless API backed by Upstash Redis.

```
wc-draft-vercel/
  index.html      the whole draft room (UI + logic)
  api/draft.js    serverless API: GET reads the draft, POST saves it
  package.json
```

## Deploy in about 2 minutes

### 1. Make a free Upstash Redis database

1. Go to upstash.com, sign in, create a Redis database (free tier is plenty).
2. On the database page, find the **REST API** section and copy two values:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

Keep these to yourself. You'll paste them into Vercel, not into the code.

### 2. Get the project into Vercel

**Option A — drag and drop (fastest):** at vercel.com, New Project, and drop this folder in. Vercel detects the static `index.html` and the `/api` function automatically.

**Option B — GitHub:** push this folder to a repo, then in Vercel, Add New Project and import the repo.

**Option C — CLI:** install the Vercel CLI, run `vercel` in this folder, follow the prompts.

### 3. Add the two environment variables

In the Vercel project, Settings, Environment Variables, add:

| Name | Value |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | the URL you copied from Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | the token you copied from Upstash |

Redeploy so the variables take effect (Deployments, the latest one, Redeploy).

### 4. Open your URL and share it

You'll get a link like `your-project.vercel.app`. First person sets up the draft (names, teams per player, randomize and start), everyone else opens the same link, taps who they are, and drafts on their turn. The header chip shows **Synced** when the backend is reachable and **Offline** if it can't reach the API.

## Notes

- Identity (which player you are on this device) is stored in the browser, so each person picks their name once per phone.
- Commissioner mode (the "I'm running the draft" toggle) gives you undo last pick, swap a team in place, and roll the draft back to a chosen pick.
- The draft lives under one Redis key (`wc-draft-v1`). To wipe it and start fresh, use Reset everything in the setup screen, or delete that key in the Upstash console.
- This site does not collect anything sensitive. Do not put the Upstash token anywhere in the code or the repo; it belongs only in Vercel's environment variables.
