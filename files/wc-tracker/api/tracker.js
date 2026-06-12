// GET /api/tracker — returns the current tracker blob (standings + meta) for the UI.
const { TRACKER_KEY, kvConfigured, kvGet, sendJson } = require('./_lib');

module.exports = async (req, res) => {
  if (!kvConfigured()) {
    return sendJson(res, 500, { error: 'Storage not configured. Connect the Upstash store.' });
  }
  try {
    const blob = await kvGet(TRACKER_KEY);
    if (!blob) {
      return sendJson(res, 200, { seeded: false, message: 'Not seeded yet. Run /api/seed.' });
    }
    // Return the display-relevant fields only.
    return sendJson(res, 200, {
      seeded: true,
      players: blob.players || [],
      config: blob.config || null,
      standings: blob.standings || [],
      matches: blob.matches || [],
      groups: blob.groups || [],
      sync: blob.sync || null,
      seededAt: blob.seededAt || null,
    });
  } catch (err) {
    return sendJson(res, 500, { error: 'Storage error', detail: String(err.message || err) });
  }
};
