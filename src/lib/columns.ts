// EXACT stat tabs + column ordering, mirroring ballchasing.com group players-stats.
// Reference: https://ballchasing.com/group/win-vs-bur-ytqn3owa8w/players-stats
//
// Each column extracts from a player's stats root (object with .core/.boost/
// .movement/.positioning/.demo) or, for Games / Win %, from a scalar root
// (the group player's `cumulative`). `lower: true` marks "lower is better".

export type Cat = "core" | "boost" | "movement" | "positioning" | "demo";

export interface Col {
  id: string;
  label: string;
  cat?: Cat;
  key?: string;
  scalar?: "games" | "win_percentage";
  lower?: boolean;
}

export interface Tab {
  id: string;
  label: string;
  columns: Col[];
}

const games: Col = { id: "games", label: "Games", scalar: "games" };
const winpct: Col = { id: "win", label: "Win %", scalar: "win_percentage" };

export const TABS: Tab[] = [
  {
    id: "core",
    label: "Core",
    columns: [
      games, winpct,
      { id: "score", label: "Score", cat: "core", key: "score" },
      { id: "shots", label: "Shots", cat: "core", key: "shots" },
      { id: "goals", label: "Goals", cat: "core", key: "goals" },
      { id: "shooting", label: "Shooting %", cat: "core", key: "shooting_percentage" },
      { id: "shots_conceded", label: "Shots Conceded", cat: "core", key: "shots_against", lower: true },
      { id: "goals_conceded", label: "Goals Conceded", cat: "core", key: "goals_against", lower: true },
      { id: "assists", label: "Assists", cat: "core", key: "assists" },
      { id: "saves", label: "Saves", cat: "core", key: "saves" },
      { id: "demos_inflicted", label: "Demos Inflicted", cat: "demo", key: "inflicted" },
      { id: "demos_taken", label: "Demos Taken", cat: "demo", key: "taken", lower: true }
    ]
  },
  {
    id: "boost",
    label: "Boost",
    columns: [
      games,
      { id: "bpm", label: "BPM", cat: "boost", key: "bpm" },
      { id: "bcpm", label: "BCPM", cat: "boost", key: "bcpm" },
      { id: "avg_amount", label: "Avg Amount", cat: "boost", key: "avg_amount" },
      { id: "time_zero", label: "Time 0 Boost", cat: "boost", key: "time_zero_boost", lower: true },
      { id: "time_full", label: "Time 100 Boost", cat: "boost", key: "time_full_boost" },
      { id: "tb0", label: "Time Boost 0-25%", cat: "boost", key: "time_boost_0_25" },
      { id: "tb25", label: "Time Boost 25-50%", cat: "boost", key: "time_boost_25_50" },
      { id: "tb50", label: "Time Boost 50-75%", cat: "boost", key: "time_boost_50_75" },
      { id: "tb75", label: "Time Boost 75-100%", cat: "boost", key: "time_boost_75_100" },
      { id: "cbig", label: "Count Big Pads", cat: "boost", key: "count_collected_big" },
      { id: "csmall", label: "Count Small Pads", cat: "boost", key: "count_collected_small" },
      { id: "csbig", label: "Count Stolen Big Pads", cat: "boost", key: "count_stolen_big" },
      { id: "cssmall", label: "Count Stolen Small Pads", cat: "boost", key: "count_stolen_small" },
      { id: "used_ss", label: "Amount Used While Supersonic", cat: "boost", key: "amount_used_while_supersonic" },
      { id: "overfill", label: "Amount Overfill", cat: "boost", key: "amount_overfill" },
      { id: "overfill_stolen", label: "Amount Overfill Stolen", cat: "boost", key: "amount_overfill_stolen" }
    ]
  },
  {
    id: "movement",
    label: "Movement",
    columns: [
      games,
      { id: "avg_speed", label: "Avg Speed", cat: "movement", key: "avg_speed" },
      { id: "pslow", label: "% Slow Speed", cat: "movement", key: "percent_slow_speed" },
      { id: "pboost", label: "% Boost Speed", cat: "movement", key: "percent_boost_speed" },
      { id: "pss", label: "% Supersonic Speed", cat: "movement", key: "percent_supersonic_speed" },
      { id: "pground", label: "% Ground", cat: "movement", key: "percent_ground" },
      { id: "plow", label: "% Low Air", cat: "movement", key: "percent_low_air" },
      { id: "phigh", label: "% High Air", cat: "movement", key: "percent_high_air" },
      { id: "psc", label: "Powerslide Count", cat: "movement", key: "count_powerslide" },
      { id: "psd", label: "Powerslide Duration", cat: "movement", key: "avg_powerslide_duration" }
    ]
  },
  {
    id: "positioning",
    label: "Positioning",
    columns: [
      games,
      { id: "pd3", label: "% Defensive 1/3", cat: "positioning", key: "percent_defensive_third" },
      { id: "pn3", label: "% Neutral 1/3", cat: "positioning", key: "percent_neutral_third" },
      { id: "po3", label: "% Offensive 1/3", cat: "positioning", key: "percent_offensive_third" },
      { id: "pd2", label: "% Defensive 1/2", cat: "positioning", key: "percent_defensive_half" },
      { id: "po2", label: "% Offensive 1/2", cat: "positioning", key: "percent_offensive_half" },
      { id: "pbb", label: "% Behind Ball", cat: "positioning", key: "percent_behind_ball" },
      { id: "pfb", label: "% In Front of Ball", cat: "positioning", key: "percent_infront_ball" },
      { id: "mback", label: "Most Back", cat: "positioning", key: "percent_most_back" },
      { id: "mfwd", label: "Most Forward", cat: "positioning", key: "percent_most_forward" },
      { id: "adb", label: "Avg Dist. Ball", cat: "positioning", key: "avg_distance_to_ball" },
      { id: "adm", label: "Avg Dist. Mates", cat: "positioning", key: "avg_distance_to_mates" }
    ]
  }
];

function num(v: any): number {
  return typeof v === "number" ? v : NaN;
}

// Extract a column value. `stats` has .core/.boost/etc; `scalar` is cumulative-like.
export function colValue(col: Col, stats: any, scalar: any): number {
  if (col.scalar) return num(scalar ? scalar[col.scalar] : undefined);
  const cat = col.cat ? stats?.[col.cat] : undefined;
  return num(cat ? cat[col.key!] : undefined);
}
