// Client-side SERIES detection + name suggestion.
//
// The ballchasing API has no native "series" concept, so we cluster replays that
// represent the same matchup played back-to-back. Design decisions driven by
// real-world feedback:
//
//  * Only PRIVATE MATCHES (and tournaments) can form a series — ranked/casual
//    matchmaking games are never a series.
//  * Rosters may SUB players between games, so matchup matching is fuzzy: two
//    games belong together if BOTH teams share at least one player with the
//    previous game (a constant "anchor" player on each side).
//  * Ineligible games (ranked/casual) are removed before clustering, so a quick
//    ranked game between two private games doesn't split the series.
//  * Side A/B are chained across games by roster overlap, so wins are counted
//    correctly even as lineups change.

export interface GroupRef { id: string; name: string; }

export interface ReplaySummary {
  id: string;
  date: string | null;
  playlist: string | null;
  groups: GroupRef[];
  blue: TeamSide;
  orange: TeamSide;
}
export interface TeamSide {
  name: string | null;
  goals: number;
  playerIds: string[];   // normalized "platform:id"
  playerNames: string[];
}

export interface Series {
  id: string;
  replays: ReplaySummary[];   // chronological (oldest -> newest)
  aName: string;
  bName: string;
  aWins: number;
  bWins: number;
  userSide: "a" | "b" | null;
  existingGroup: GroupRef | null; // set if every replay already shares a group
}

export interface UserOpts { myId?: string | null; myName?: string | null; }

const MAX_GAP_MS = 60 * 60 * 1000; // 60 minutes between consecutive private games

// ---- eligibility -----------------------------------------------------------
export function isSeriesEligible(playlist: string | null): boolean {
  const p = (playlist || "").toLowerCase();
  return p.includes("private") || p.includes("tournament");
}

// Best-effort display name for a single team side (used by the replay row).
export function teamNameFallback(side: TeamSide): string {
  if (side.name && side.name.trim()) return side.name.trim();
  if (side.playerNames.length) return side.playerNames[0];
  return "Team";
}

// ---- helpers ---------------------------------------------------------------
function ids(side: TeamSide): string[] {
  return (side.playerIds.length ? side.playerIds : side.playerNames).map((s) => s.toLowerCase());
}
function overlap(a: TeamSide, b: TeamSide): number {
  const sb = new Set(ids(b));
  let n = 0;
  for (const x of ids(a)) if (sb.has(x)) n++;
  return n;
}
function time(r: ReplaySummary): number {
  const t = r.date ? Date.parse(r.date) : NaN;
  return Number.isFinite(t) ? t : 0;
}

// Do two consecutive games represent the same matchup (allowing subs)?
function sameMatchup(prev: ReplaySummary, cur: ReplaySummary): boolean {
  if ((prev.playlist || "") !== (cur.playlist || "")) return false;
  if (Math.abs(time(cur) - time(prev)) > MAX_GAP_MS) return false;
  // straight pairing (blue↔blue, orange↔orange) vs swapped
  const straight = Math.min(overlap(prev.blue, cur.blue), overlap(prev.orange, cur.orange));
  const swapped = Math.min(overlap(prev.blue, cur.orange), overlap(prev.orange, cur.blue));
  // require an anchor player on BOTH sides under the better pairing
  return Math.max(straight, swapped) >= 1;
}

// ---------------------------------------------------------------------------
export function detectSeries(allReplays: ReplaySummary[], user: UserOpts = {}): Series[] {
  // 1) keep only series-eligible games, sorted chronologically
  const eligible = allReplays.filter((r) => isSeriesEligible(r.playlist)).sort((a, b) => time(a) - time(b));

  const out: Series[] = [];
  let current: ReplaySummary[] = [];
  const flush = () => { if (current.length >= 2) out.push(buildSeries(current, user)); current = []; };

  for (const r of eligible) {
    if (current.length === 0) { current = [r]; continue; }
    if (sameMatchup(current[current.length - 1], r)) current.push(r);
    else { flush(); current = [r]; }
  }
  flush();
  return out;
}

function buildSeries(replays: ReplaySummary[], user: UserOpts): Series {
  // Chain side A/B across games by overlap so wins are attributed consistently.
  let prevA = replays[0].blue;
  let prevB = replays[0].orange;
  let aWins = 0, bWins = 0;
  const aRosters: TeamSide[] = [];
  const bRosters: TeamSide[] = [];

  for (let i = 0; i < replays.length; i++) {
    const r = replays[i];
    let aSide: TeamSide, bSide: TeamSide;
    if (i === 0) { aSide = r.blue; bSide = r.orange; }
    else {
      const straight = overlap(prevA, r.blue) + overlap(prevB, r.orange);
      const swapped = overlap(prevA, r.orange) + overlap(prevB, r.blue);
      if (swapped > straight) { aSide = r.orange; bSide = r.blue; }
      else { aSide = r.blue; bSide = r.orange; }
    }
    if (aSide.goals > bSide.goals) aWins++;
    else if (bSide.goals > aSide.goals) bWins++;
    aRosters.push(aSide); bRosters.push(bSide);
    prevA = aSide; prevB = bSide;
  }

  const userSide = whichSide(aRosters, bRosters, user);
  const aName = sideName(aRosters, user, userSide === "a");
  const bName = sideName(bRosters, user, userSide === "b");

  return {
    id: replays.map((r) => r.id).join(","),
    replays,
    aName, bName, aWins, bWins,
    userSide,
    existingGroup: commonGroup(replays)
  };
}

// Display name for a side across the series.
//  * explicit team name (SAN/DEN) wins if consistently present
//  * otherwise list the FULL lineup of the representative game joined by " + "
//    (e.g. "huday + Burmyy"), with the user's name first on the user's side.
function sideName(rosters: TeamSide[], user: UserOpts, isUserSide: boolean): string {
  const named = rosters.find((s) => s.name && s.name.trim());
  if (named && rosters.every((s) => !s.name || s.name === named.name)) return named.name!.trim();

  // representative roster: the game where the user appears (user side), else game 0
  let rep = rosters[0];
  if (isUserSide && (user.myName || user.myId)) {
    const found = rosters.find((s) => sideHasUser(s, user));
    if (found) rep = found;
  }
  let names = [...rep.playerNames];
  if (isUserSide && user.myName) {
    const idx = names.findIndex((n) => n.toLowerCase() === user.myName!.toLowerCase());
    if (idx > 0) { names.splice(idx, 1); names.unshift(user.myName); }   // user first
    else if (idx === -1) names.unshift(user.myName);
  }
  if (names.length) return names.join(" + ");
  return rep.name || "Team";
}

function whichSide(aRosters: TeamSide[], bRosters: TeamSide[], user: UserOpts): "a" | "b" | null {
  if (!user.myId && !user.myName) return null;
  for (let i = 0; i < aRosters.length; i++) {
    if (sideHasUser(aRosters[i], user)) return "a";
    if (sideHasUser(bRosters[i], user)) return "b";
  }
  return null;
}

function sideHasUser(side: TeamSide, user: UserOpts): boolean {
  const myId = (user.myId || "").toLowerCase();
  if (myId) {
    for (const pid of side.playerIds) {
      const low = pid.toLowerCase();
      const bare = low.includes(":") ? low.split(":").pop()! : low;
      if (low === myId || bare === myId || low.endsWith(":" + myId)) return true;
    }
  }
  const myName = (user.myName || "").toLowerCase();
  if (myName) for (const pn of side.playerNames) if (pn.toLowerCase() === myName) return true;
  return false;
}

function commonGroup(replays: ReplaySummary[]): GroupRef | null {
  if (replays.some((r) => !r.groups || r.groups.length === 0)) return null;
  let inter: GroupRef[] = replays[0].groups;
  for (let i = 1; i < replays.length; i++) {
    const ids = new Set(replays[i].groups.map((g) => g.id));
    inter = inter.filter((g) => ids.has(g.id));
    if (inter.length === 0) return null;
  }
  return inter[0] || null;
}

// ---------------------------------------------------------------------------
// Name suggestions: user's team leads the score; else the winner leads.
// ---------------------------------------------------------------------------
export function suggestNames(series: Series): string[] {
  const { aName, bName, aWins, bWins, userSide } = series;
  let leftName: string, rightName: string, leftScore: number, rightScore: number;
  if (userSide === "a") { leftName = aName; rightName = bName; leftScore = aWins; rightScore = bWins; }
  else if (userSide === "b") { leftName = bName; rightName = aName; leftScore = bWins; rightScore = aWins; }
  else if (bWins > aWins) { leftName = bName; rightName = aName; leftScore = bWins; rightScore = aWins; }
  else { leftName = aName; rightName = bName; leftScore = aWins; rightScore = bWins; }

  const date = seriesDate(series);
  const bo = `Bo${bestOf(series)}`;
  const versus = `${leftName} vs ${rightName}`;
  const score = `${leftName} ${leftScore}-${rightScore} ${rightName}`;
  const suggestions = [versus, score];
  if (date) suggestions.push(`${versus} — ${date}`);
  suggestions.push(`${versus} (${bo})`);
  return Array.from(new Set(suggestions));
}

// scoreboard string for the banner (user/winner-leading, same rule as names)
export function seriesScoreLine(series: Series): string {
  const names = suggestNames(series);
  return names[1] || names[0];
}

function bestOf(series: Series): number {
  const games = series.replays.length;
  const clinch = games >= 6 ? 4 : games >= 4 ? 3 : 2;
  return clinch * 2 - 1;
}
function seriesDate(series: Series): string | null {
  const d = series.replays[0].date;
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}
