// Shared helpers for the WC 2026 fantasy tracker.
// CommonJS, zero build step — runs on Vercel's Node runtime.

const crypto = require('crypto');

const TRACKER_KEY = 'wc-tracker-v1';
const DRAFT_API = 'https://wc-draft-room.vercel.app/api/draft';
const FD_MATCHES = 'https://api.football-data.org/v4/competitions/WC/matches';

// ---- The 48-team field (mirrors the draft's TEAMS array) ------------------
// [code, name, group, flag]
const TEAMS = [
  ['MEX', 'Mexico', 'A', '🇲🇽'], ['RSA', 'South Africa', 'A', '🇿🇦'], ['KOR', 'Korea Republic', 'A', '🇰🇷'], ['CZE', 'Czechia', 'A', '🇨🇿'],
  ['CAN', 'Canada', 'B', '🇨🇦'], ['BIH', 'Bosnia & Herzegovina', 'B', '🇧🇦'], ['QAT', 'Qatar', 'B', '🇶🇦'], ['SUI', 'Switzerland', 'B', '🇨🇭'],
  ['BRA', 'Brazil', 'C', '🇧🇷'], ['MAR', 'Morocco', 'C', '🇲🇦'], ['HAI', 'Haiti', 'C', '🇭🇹'], ['SCO', 'Scotland', 'C', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'],
  ['USA', 'United States', 'D', '🇺🇸'], ['PAR', 'Paraguay', 'D', '🇵🇾'], ['AUS', 'Australia', 'D', '🇦🇺'], ['TUR', 'Türkiye', 'D', '🇹🇷'],
  ['GER', 'Germany', 'E', '🇩🇪'], ['CUW', 'Curaçao', 'E', '🇨🇼'], ['CIV', 'Ivory Coast', 'E', '🇨🇮'], ['ECU', 'Ecuador', 'E', '🇪🇨'],
  ['NED', 'Netherlands', 'F', '🇳🇱'], ['JPN', 'Japan', 'F', '🇯🇵'], ['SWE', 'Sweden', 'F', '🇸🇪'], ['TUN', 'Tunisia', 'F', '🇹🇳'],
  ['BEL', 'Belgium', 'G', '🇧🇪'], ['EGY', 'Egypt', 'G', '🇪🇬'], ['IRN', 'Iran', 'G', '🇮🇷'], ['NZL', 'New Zealand', 'G', '🇳🇿'],
  ['ESP', 'Spain', 'H', '🇪🇸'], ['CPV', 'Cape Verde', 'H', '🇨🇻'], ['KSA', 'Saudi Arabia', 'H', '🇸🇦'], ['URU', 'Uruguay', 'H', '🇺🇾'],
  ['FRA', 'France', 'I', '🇫🇷'], ['SEN', 'Senegal', 'I', '🇸🇳'], ['IRQ', 'Iraq', 'I', '🇮🇶'], ['NOR', 'Norway', 'I', '🇳🇴'],
  ['ARG', 'Argentina', 'J', '🇦🇷'], ['ALG', 'Algeria', 'J', '🇩🇿'], ['AUT', 'Austria', 'J', '🇦🇹'], ['JOR', 'Jordan', 'J', '🇯🇴'],
  ['POR', 'Portugal', 'K', '🇵🇹'], ['COD', 'DR Congo', 'K', '🇨🇩'], ['UZB', 'Uzbekistan', 'K', '🇺🇿'], ['COL', 'Colombia', 'K', '🇨🇴'],
  ['ENG', 'England', 'L', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'], ['CRO', 'Croatia', 'L', '🇭🇷'], ['GHA', 'Ghana', 'L', '🇬🇭'], ['PAN', 'Panama', 'L', '🇵🇦'],
].map((t) => ({ code: t[0], name: t[1], group: t[2], flag: t[3] }));

const TEAM = Object.fromEntries(TEAMS.map((t) => [t.code, t]));

// ---- Frozen draft order (code -> overall pick #) --------------------------
// Mirrors data/draft-final.json (6 players × 8 = 48 picks, snake). Round =
// ceil(pick / playerCount). Re-generate this if the league ever re-drafts —
// same trigger as re-running tools/snapshot_draft.py + re-seeding.
const DRAFT_ORDER = {
  FRA: 1, MEX: 2, ESP: 3, BRA: 4, ARG: 5, NED: 6, GER: 7, ENG: 8,
  POR: 9, BEL: 10, USA: 11, COL: 12, NOR: 13, SWE: 14, MAR: 15, SUI: 16,
  JPN: 17, CRO: 18, AUS: 19, PAR: 20, URU: 21, SEN: 22, CAN: 23, ECU: 24,
  TUR: 25, ALG: 26, AUT: 27, EGY: 28, KSA: 29, PAN: 30, NZL: 31, COD: 32,
  GHA: 33, CZE: 34, IRN: 35, CIV: 36, KOR: 37, IRQ: 38, RSA: 39, SCO: 40,
  BIH: 41, HAI: 42, QAT: 43, UZB: 44, TUN: 45, JOR: 46, CPV: 47, CUW: 48,
};

// ---- football-data → our code mapping -------------------------------------
// We match on normalized name first (most reliable), then 3-letter code.
// ALIASES cover names football-data spells differently than we do. Anything
// still unmatched is reported by /api/sync so a human can add an override.
const norm = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const NAME_ALIASES = {
  'south korea': 'KOR', 'korea republic': 'KOR', 'republic of korea': 'KOR',
  'turkey': 'TUR', 'turkiye': 'TUR',
  'ivory coast': 'CIV', 'cote d ivoire': 'CIV',
  'dr congo': 'COD', 'congo dr': 'COD', 'democratic republic of congo': 'COD', 'congo': 'COD',
  'czech republic': 'CZE', 'czechia': 'CZE',
  'usa': 'USA', 'united states': 'USA', 'united states of america': 'USA',
  'bosnia and herzegovina': 'BIH', 'bosnia herzegovina': 'BIH',
  'cape verde': 'CPV', 'cabo verde': 'CPV',
  'curacao': 'CUW',
  'iran': 'IRN', 'ir iran': 'IRN',
  'saudi arabia': 'KSA',
  'south africa': 'RSA',
};

// Build a normalized-name → code index from our own team list too.
const NAME_INDEX = Object.fromEntries(TEAMS.map((t) => [norm(t.name), t.code]));

// Map a football-data team object {name, tla} to our code, honoring overrides.
function mapApiTeam(apiTeam, overrides) {
  if (!apiTeam) return null;
  const ovr = (overrides && overrides.teamByName) || {};
  const n = norm(apiTeam.name);
  if (ovr[n]) return ovr[n];
  if (NAME_ALIASES[n]) return NAME_ALIASES[n];
  if (NAME_INDEX[n]) return NAME_INDEX[n];
  const tla = (apiTeam.tla || '').toUpperCase();
  if (TEAM[tla]) return tla;
  return null; // unmatched — surfaced by sync
}

// ---- Default config (scoring) ---------------------------------------------
const DEFAULT_CONFIG = {
  groupWin: 3,
  groupDraw: 1,
  // Flat knockout bonus for the FURTHEST round a team reaches (not cumulative).
  bonus: { R32: 1, R16: 2, QF: 4, SF: 6, RUNNER_UP: 7, CHAMP: 8 },
};

// football-data stage → our round rank (how far a team got). Higher = further.
const STAGE_RANK = {
  GROUP_STAGE: 0,
  LAST_32: 1,
  LAST_16: 2,
  QUARTER_FINALS: 3,
  SEMI_FINALS: 4,
  THIRD_PLACE: 4, // playing the 3rd-place match means you reached the SF and lost it
  FINAL: 5,
};
const RANK_BONUS_KEY = { 1: 'R32', 2: 'R16', 3: 'QF', 4: 'SF' };

// ---- Scoring engine -------------------------------------------------------
// Given the tracker blob (rosters/players/config/overrides) and the raw
// football-data matches array, compute per-team stats and per-player standings.
function computeStandings(blob, matches) {
  const cfg = blob.config || DEFAULT_CONFIG;
  const overrides = blob.overrides || {};
  const unmatched = new Set();

  // Per-team accumulators
  const stat = {};
  TEAMS.forEach((t) => {
    stat[t.code] = { code: t.code, gW: 0, gD: 0, gL: 0, gPts: 0, gf: 0, ga: 0, rank: -1, champion: false, runnerUp: false };
  });

  const codeOf = (apiTeam) => {
    const c = mapApiTeam(apiTeam, overrides);
    if (!c && apiTeam && apiTeam.name) unmatched.add(apiTeam.name);
    return c;
  };

  for (const m of matches || []) {
    const home = codeOf(m.homeTeam);
    const away = codeOf(m.awayTeam);
    const rank = STAGE_RANK[m.stage];
    if (rank === undefined) continue;

    // "Reached" a round = appears (named) in a match at that stage, regardless of status.
    if (home && stat[home]) stat[home].rank = Math.max(stat[home].rank, rank);
    if (away && stat[away]) stat[away].rank = Math.max(stat[away].rank, rank);

    const finished = m.status === 'FINISHED';

    // Goals for/against — accumulated across ALL rounds (group + knockout) for a
    // manager-level goal-differential tie-break. This never touches points; it's
    // only used to break ties between managers on equal totals. Penalty shootouts
    // live in a separate field, so fullTime goals correctly exclude them.
    if (finished) {
      const ft = m.score && m.score.fullTime;
      if (ft && typeof ft.home === 'number' && typeof ft.away === 'number') {
        if (home && stat[home]) { stat[home].gf += ft.home; stat[home].ga += ft.away; }
        if (away && stat[away]) { stat[away].gf += ft.away; stat[away].ga += ft.home; }
      }
    }

    // Group points — only finished group matches, per match.
    if (m.stage === 'GROUP_STAGE' && finished) {
      const w = m.score && m.score.winner; // HOME_TEAM | AWAY_TEAM | DRAW
      const award = (code, pts, res) => {
        if (!code || !stat[code]) return;
        stat[code].gPts += pts;
        stat[code][res] += 1;
      };
      if (w === 'DRAW') { award(home, cfg.groupDraw, 'gD'); award(away, cfg.groupDraw, 'gD'); }
      else if (w === 'HOME_TEAM') { award(home, cfg.groupWin, 'gW'); award(away, 0, 'gL'); }
      else if (w === 'AWAY_TEAM') { award(away, cfg.groupWin, 'gW'); award(home, 0, 'gL'); }
    }

    // Champion / runner-up come from the FINAL once it's decided.
    if (m.stage === 'FINAL' && finished && m.score && m.score.winner) {
      const winCode = m.score.winner === 'HOME_TEAM' ? home : away;
      const loseCode = m.score.winner === 'HOME_TEAM' ? away : home;
      if (winCode && stat[winCode]) stat[winCode].champion = true;
      if (loseCode && stat[loseCode]) stat[loseCode].runnerUp = true;
    }
  }

  const bonusFor = (s) => {
    if (s.champion) return { round: 'Champion', bonus: cfg.bonus.CHAMP };
    if (s.runnerUp) return { round: 'Runner-up', bonus: cfg.bonus.RUNNER_UP };
    if (s.rank === 5) return { round: 'Final', bonus: cfg.bonus.RUNNER_UP }; // reached final, not yet decided
    const key = RANK_BONUS_KEY[s.rank];
    if (key) return { round: { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarterfinal', SF: 'Semifinal' }[key], bonus: cfg.bonus[key] };
    return { round: s.rank === 0 ? 'Group stage' : '—', bonus: 0 };
  };

  const rosters = blob.rosters || {};
  const players = blob.players || [];
  const playerCount = players.length || 6;
  const standings = players.map((name, pid) => {
    const codes = rosters[String(pid)] || [];
    const teams = codes.map((code) => {
      const s = stat[code] || { gW: 0, gD: 0, gL: 0, gPts: 0, gf: 0, ga: 0, rank: -1 };
      const b = bonusFor(s);
      const t = TEAM[code] || { name: code, flag: '' };
      const pick = DRAFT_ORDER[code] || null;            // overall draft pick #
      return {
        code, name: t.name, flag: t.flag,
        gW: s.gW, gD: s.gD, gL: s.gL, gPts: s.gPts,
        gf: s.gf || 0, ga: s.ga || 0, gd: (s.gf || 0) - (s.ga || 0),
        round: b.round, bonus: b.bonus,
        pick, draftRound: pick ? Math.ceil(pick / playerCount) : null,
        total: s.gPts + b.bonus,
      };
    });
    const groupPts = teams.reduce((a, t) => a + t.gPts, 0);
    const bonus = teams.reduce((a, t) => a + t.bonus, 0);
    // Manager goal differential = sum of every rostered team's GD, whole tournament.
    const gd = teams.reduce((a, t) => a + t.gd, 0);
    return { player: pid, name, total: groupPts + bonus, groupPts, bonus, gd, teams };
  });

  // Sort: total desc, then goal differential (tie-break), then group pts, then name.
  standings.sort((a, b) => b.total - a.total || b.gd - a.gd || b.groupPts - a.groupPts || a.name.localeCompare(b.name));

  return { standings, unmatched: [...unmatched], teamStats: stat };
}

// Build the 12 live group tables (for the Grouping tab) from the per-team stats.
// Each team carries flag, name, fantasy owner, and W-D-L record; sorted into a
// live mini-table by points → wins → name (no goal data on the free tier).
function buildGroups(blob, teamStats) {
  const owners = ownerMap(blob);
  const byGroup = {};
  TEAMS.forEach((t) => {
    const s = (teamStats && teamStats[t.code]) || { gW: 0, gD: 0, gL: 0, gPts: 0 };
    (byGroup[t.group] = byGroup[t.group] || []).push({
      code: t.code, name: t.name, flag: t.flag, owner: owners[t.code] || null,
      gW: s.gW, gD: s.gD, gL: s.gL, gPts: s.gPts, pld: s.gW + s.gD + s.gL,
    });
  });
  return Object.keys(byGroup).sort().map((g) => ({
    group: g,
    teams: byGroup[g].sort((a, b) => b.gPts - a.gPts || b.gW - a.gW || a.name.localeCompare(b.name)),
  }));
}

// ---- Match list for the Matches tab ---------------------------------------
// code -> owning player's name (every drafted team has exactly one owner)
function ownerMap(blob) {
  const players = blob.players || [];
  const rosters = blob.rosters || {};
  const out = {};
  Object.keys(rosters).forEach((pid) => {
    (rosters[pid] || []).forEach((code) => { out[code] = players[Number(pid)] || null; });
  });
  return out;
}

// Lean, display-ready match objects with owner names baked in, sorted by kickoff.
// Knockout placeholders (no team assigned yet) come through as "TBD" with no owner.
function normalizeMatches(matches, blob) {
  const owners = ownerMap(blob);
  const overrides = blob.overrides || {};
  const side = (apiTeam) => {
    const code = mapApiTeam(apiTeam, overrides);
    const t = code ? TEAM[code] : null;
    return {
      code: code || null,
      name: t ? t.name : (apiTeam && apiTeam.name) || 'TBD',
      flag: t ? t.flag : '',
      owner: code ? owners[code] || null : null,
    };
  };
  return (matches || [])
    .map((m) => {
      const ft = (m.score && m.score.fullTime) || {};
      return {
        id: m.id,
        utc: m.utcDate,
        stage: m.stage,
        group: m.group || null,
        status: m.status,
        live: m.status === 'IN_PLAY' || m.status === 'PAUSED',
        finished: m.status === 'FINISHED',
        home: side(m.homeTeam),
        away: side(m.awayTeam),
        hg: typeof ft.home === 'number' ? ft.home : null,
        ag: typeof ft.away === 'number' ? ft.away : null,
      };
    })
    .sort((a, b) => (a.utc < b.utc ? -1 : a.utc > b.utc ? 1 : 0));
}

// ---- KV (Upstash Redis REST, command API — same store as the draft) -------
function kvCreds() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}
function kvConfigured() {
  const { url, token } = kvCreds();
  return Boolean(url && token);
}
async function kvCommand(command) {
  const { url, token } = kvCreds();
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return r.json(); // { result }
}
async function kvGet(key) {
  const out = await kvCommand(['GET', key]);
  return out.result ? JSON.parse(out.result) : null;
}
async function kvSet(key, value) {
  return kvCommand(['SET', key, JSON.stringify(value)]);
}

// ---- HTTP helpers ---------------------------------------------------------
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function fetchDraft() {
  const r = await fetch(DRAFT_API, { cache: 'no-store' });
  if (!r.ok) throw new Error(`draft api ${r.status}`);
  const d = await r.json();
  return d.state || null;
}

// Fetch the WC matches and read football-data's throttling headers so we can
// back off before hammering the limiter:
//   x-requests-available-minute — calls left this minute (free tier = 10/min)
//   x-requestcounter-reset      — seconds until that window resets
// Returns { matches, rate:{available,reset} }. On HTTP 429 throws an error
// carrying { code:429, retryAfter } so the caller can set a hard cooldown.
async function fetchMatches() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error('FOOTBALL_DATA_TOKEN not set');
  const r = await fetch(FD_MATCHES, { headers: { 'X-Auth-Token': token } });

  const num = (h) => { const v = Number(r.headers.get(h)); return Number.isFinite(v) ? v : null; };
  const rate = { available: num('x-requests-available-minute'), reset: num('x-requestcounter-reset') };

  if (r.status === 429) {
    const err = new Error(`rate limited — retry in ${rate.reset != null ? rate.reset : 60}s`);
    err.code = 429;
    err.retryAfter = rate.reset != null ? rate.reset : 60;
    err.rate = rate;
    throw err;
  }
  if (!r.ok) {
    const err = new Error(`football-data ${r.status}`);
    err.rate = rate;
    throw err;
  }
  const d = await r.json();
  return { matches: d.matches || [], rate };
}

module.exports = {
  TRACKER_KEY, TEAMS, TEAM, DEFAULT_CONFIG,
  computeStandings, normalizeMatches, buildGroups, mapApiTeam,
  kvConfigured, kvGet, kvSet,
  sendJson, fetchDraft, fetchMatches,
};
