// Heat-tinting utilities for stat tables.
//
// For each column we normalize values 0..1 (min..max within the visible column)
// and map to a color. Direction-aware: "lower is better" stats invert the ramp so
// color ALWAYS reads good (green) -> bad (red), consistent across the table.

// Substrings that mark a stat where a LOWER value is better.
const LOWER_IS_BETTER = [
  "against",      // goals against while last defender
  "taken",        // demos taken
  "time_zero",    // time at 0 boost
  "zero_boost",
  "conceded",
  "0_boost"
];

export function isLowerBetter(statKey: string): boolean {
  const k = statKey.toLowerCase();
  return LOWER_IS_BETTER.some((s) => k.includes(s));
}

// Themed heat: a single accent-blue ramp. Higher "goodness" => stronger blue
// tint; low values fade toward transparent. Matches the app's dark/blue theme
// instead of a red→green scale.
function goodnessColor(g: number): string {
  g = Math.max(0, Math.min(1, g));
  // accent blue (#4f9cff = 79,156,255). Alpha scales with goodness.
  const alpha = 0.05 + g * 0.34; // 0.05 .. 0.39
  return `rgba(79, 156, 255, ${alpha.toFixed(3)})`;
}

export interface ColumnStats {
  min: number;
  max: number;
}

export function columnStats(values: number[]): ColumnStats {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) { min = 0; max = 0; }
  return { min, max };
}

export function cellColor(
  value: number,
  stats: ColumnStats,
  lowerBetter: boolean,
  enabled: boolean
): string | undefined {
  if (!enabled) return undefined;
  if (!Number.isFinite(value)) return undefined;
  const span = stats.max - stats.min;
  if (span <= 0) return undefined; // uniform column -> no tint
  let norm = (value - stats.min) / span; // 0..1 where 1 = highest value
  let goodness = lowerBetter ? 1 - norm : norm;
  return goodnessColor(goodness);
}
