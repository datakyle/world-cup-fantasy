// /api/draft  — shared draft state, stored in Upstash Redis
// GET  -> { state: <draft or null> }
// POST { state } -> saves the draft   |   POST { reset:true } -> clears it
//
// Requires two environment variables (set them in Vercel, never in code):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "wc-draft-v1";

async function redis(command) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error("redis " + r.status);
  return r.json(); // { result: ... }
}

export default async function handler(req, res) {
  if (!URL || !TOKEN) {
    return res.status(500).json({ error: "Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN env vars" });
  }
  try {
    if (req.method === "GET") {
      const out = await redis(["GET", KEY]);
      const state = out.result ? JSON.parse(out.result) : null;
      return res.status(200).json({ state });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
      if (body.reset) {
        await redis(["DEL", KEY]);
        return res.status(200).json({ ok: true, state: null });
      }
      if (!body.state) return res.status(400).json({ error: "no state in body" });
      await redis(["SET", KEY, JSON.stringify(body.state)]);
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
