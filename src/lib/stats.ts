// Helpers to flatten ballchasing's nested stat objects into dotted-key maps,
// and to format values for display.

export type FlatStats = Record<string, number>;

// Recursively flatten a nested object of numbers into { "core.goals": 3, ... }
export function flatten(obj: any, prefix = ""): FlatStats {
  const out: FlatStats = {};
  if (obj == null || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "number") {
      out[key] = v;
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    }
  }
  return out;
}

// A friendlier label from a dotted key: "boost.bpm" -> "Boost · Bpm"
export function prettyLabel(key: string): string {
  return key
    .split(".")
    .map((p) =>
      p
        .replace(/_/g, " ")
        .replace(/\bpercent\b/i, "%")
        .replace(/\b(\w)/g, (m) => m.toUpperCase())
    )
    .join(" · ");
}

export function shortLabel(key: string): string {
  // last segment only for compact headers
  const last = key.split(".").pop() || key;
  return last.replace(/_/g, " ").replace(/\b(\w)/g, (m) => m.toUpperCase());
}

export function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (Number.isInteger(v)) return String(v);
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

// Preferred display order for stat categories.
const CATEGORY_ORDER = ["", "core", "boost", "movement", "positioning", "demo"];

export function sortStatKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.split(".")[0]);
    const cb = CATEGORY_ORDER.indexOf(b.split(".")[0]);
    const ra = ca === -1 ? 99 : ca;
    const rb = cb === -1 ? 99 : cb;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}
