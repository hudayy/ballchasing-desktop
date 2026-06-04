// Normalize a /replays list item into the ReplaySummary used by series detection.
import type { ReplaySummary, TeamSide } from "./series";

function normId(p: any): string {
  if (!p) return "";
  if (p.id && typeof p.id === "object") return `${p.id.platform || ""}:${p.id.id || ""}`;
  if (typeof p.id === "string") return p.id;
  return p.name || "";
}

function side(team: any): TeamSide {
  const players = (team && team.players) || [];
  return {
    name: (team && (team.name || team.team_name)) || null,
    goals: (team && (team.goals ?? team.stats?.core?.goals)) ?? 0,
    playerIds: players.map(normId).filter(Boolean),
    playerNames: players.map((p: any) => p?.name).filter(Boolean)
  };
}

export function toSummary(replay: any): ReplaySummary {
  return {
    id: replay.id,
    date: replay.date || replay.created || null,
    // prefer the playlist *id* (stable, e.g. "private", "ranked-duels") for eligibility checks
    playlist: replay.playlist_id || replay.playlist_name || null,
    groups: ((replay.groups as any[]) || []).map((g) => ({ id: g.id, name: g.name })),
    blue: side(replay.blue),
    orange: side(replay.orange)
  };
}
