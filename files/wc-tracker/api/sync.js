// GET|POST /api/sync — pull real WC results, recompute standings, save.
// Open (no token) so the UI's Refresh button and the daily Vercel cron can both
// call it. Two layers of rate protection so we never hit football-data's limiter:
//   1. Soft throttle: skip the external call if we synced < THROTTLE_MS ago.
//   2. Hard cooldown: if a previous call was 429'd (or burned the last request in
//      the minute), honor football-data's x-requestcounter-reset before calling again.
const {
  TRACKER_KEY, DEFAULT_CONFIG, computeStandings, normalizeMatches, buildGroups,
  kvConfigured, kvGet, kvSet, sendJson, fetchMatches,
} = require('./_lib');

const THROTTLE_MS = 30 * 1000;

module.exports = async (req, res) => {
  if (!kvConfigured()) return sendJson(res, 500, { error: 'Storage not configured.' });

  try {
    const blob = await kvGet(TRACKER_KEY);
    if (!blob || !blob.rosters) {
      return sendJson(res, 400, { error: 'Not seeded. Run /api/seed first.' });
    }
    if (!blob.config) blob.config = DEFAULT_CONFIG;

    const now = Date.now();
    const sync = blob.sync || {};
    const force = (req.query && req.query.force) || /[?&]force=/.test(req.url || '');

    // 1. Hard cooldown imposed by football-data's own headers — NEVER overridden,
    //    not even by ?force, so we can't hammer the limiter.
    const cooldownUntil = sync.cooldownUntil ? Date.parse(sync.cooldownUntil) : 0;
    if (cooldownUntil && now < cooldownUntil) {
      return sendJson(res, 200, {
        throttled: true, reason: 'rate-cooldown',
        retryInMs: cooldownUntil - now,
        standings: blob.standings || [], sync,
      });
    }

    // 2. Soft throttle — recent successful sync, skip the external call.
    const last = sync.lastSync ? Date.parse(sync.lastSync) : 0;
    if (!force && now - last < THROTTLE_MS) {
      return sendJson(res, 200, { throttled: true, reason: 'recent', standings: blob.standings || [], sync });
    }

    let result;
    try {
      result = await fetchMatches(); // { matches, rate }
    } catch (err) {
      // Preserve last-good standings; record the failure and, on 429, set a hard cooldown.
      const next = {
        lastSync: sync.lastSync,                 // keep the last successful timestamp
        lastAttempt: new Date(now).toISOString(),
        ok: false,
        error: String(err.message || err),
        rate: err.rate || sync.rate || null,
      };
      if (err.code === 429) {
        next.cooldownUntil = new Date(now + (err.retryAfter || 60) * 1000).toISOString();
      }
      blob.sync = next;
      await kvSet(TRACKER_KEY, blob);
      return sendJson(res, 200, { ok: false, error: next.error, cooldownUntil: next.cooldownUntil || null, standings: blob.standings || [], sync: next });
    }

    const { matches, rate } = result;
    const { standings, unmatched, teamStats } = computeStandings(blob, matches);
    blob.matches = normalizeMatches(matches, blob); // for the Matches tab
    blob.groups = buildGroups(blob, teamStats);     // for the Grouping tab

    const next = {
      lastSync: new Date(now).toISOString(),
      lastAttempt: new Date(now).toISOString(),
      ok: true,
      matchCount: matches.length,
      unmatched,
      rate,
    };
    // Proactive cooldown: if this call used the last request in the minute window,
    // wait out the reset before allowing another external call.
    if (rate && rate.available != null && rate.available <= 0 && rate.reset != null) {
      next.cooldownUntil = new Date(now + rate.reset * 1000).toISOString();
    }

    blob.rev = (blob.rev || 0) + 1;
    blob.standings = standings;
    blob.sync = next;
    await kvSet(TRACKER_KEY, blob);

    return sendJson(res, 200, { ok: true, standings, sync: next });
  } catch (err) {
    return sendJson(res, 500, { error: 'Sync failed', detail: String(err.message || err) });
  }
};
