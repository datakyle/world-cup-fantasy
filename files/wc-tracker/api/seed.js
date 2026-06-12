// POST /api/seed?token=SEED_TOKEN — freeze the draft rosters into the tracker store.
// Run this once the draft is complete (and re-run if the league re-drafts). It
// snapshots players + rosters from the live draft and initializes config. It does
// NOT touch already-computed standings beyond re-seeding rosters.
const crypto = require('crypto');
const {
  TRACKER_KEY, DEFAULT_CONFIG, kvConfigured, kvGet, kvSet, sendJson, fetchDraft,
} = require('./_lib');

function tokenOk(req) {
  const want = process.env.SEED_TOKEN || '';
  if (!want) return false;
  const got = (req.query && req.query.token) || new URL(req.url, 'http://x').searchParams.get('token') || '';
  const a = Buffer.from(String(got));
  const b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST' });
  if (!tokenOk(req)) return sendJson(res, 401, { error: 'Bad or missing token' });
  if (!kvConfigured()) return sendJson(res, 500, { error: 'Storage not configured.' });

  try {
    const draft = await fetchDraft();
    if (!draft || !draft.started) return sendJson(res, 400, { error: 'No started draft to seed from.' });

    const players = draft.players || [];
    const slots = draft.slots || 0;
    const picks = draft.picks || [];
    const expected = players.length * slots;

    const rosters = {};
    players.forEach((_, pid) => (rosters[String(pid)] = []));
    picks.forEach((p) => {
      if (rosters[String(p.player)]) rosters[String(p.player)].push(p.team);
    });

    const existing = (await kvGet(TRACKER_KEY)) || {};
    const blob = {
      ...existing,
      rev: (existing.rev || 0) + 1,
      players,
      rosters,
      config: existing.config || DEFAULT_CONFIG,
      overrides: existing.overrides || {},
      seededAt: new Date().toISOString(),
      draftComplete: picks.length >= expected,
      draftPicks: picks.length,
    };
    await kvSet(TRACKER_KEY, blob);

    return sendJson(res, 200, {
      ok: true,
      players,
      rosters,
      draftComplete: blob.draftComplete,
      picks: picks.length,
      expected,
      note: blob.draftComplete ? 'Draft complete.' : `Draft incomplete (${picks.length}/${expected}) — re-seed when done.`,
    });
  } catch (err) {
    return sendJson(res, 500, { error: 'Seed failed', detail: String(err.message || err) });
  }
};
