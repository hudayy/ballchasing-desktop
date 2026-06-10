// Build CSV text from a stat table (any of the players/teams/selection tables).
import type { Col } from "./columns";

export interface CsvRow { label: string; sub?: string; values: Record<string, number>; }

function esc(s: unknown): string {
  const t = String(s ?? "");
  return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

export function buildCsv(nameHeader: string, columns: Col[], rows: CsvRow[]): string {
  const lines = [[nameHeader, ...columns.map((c) => c.label)].map(esc).join(",")];
  for (const r of rows) {
    const cells = columns.map((c) => {
      const v = r.values[c.id];
      return Number.isFinite(v) ? String(+v.toFixed(3)) : "";
    });
    lines.push([r.label, ...cells].map(esc).join(","));
  }
  return lines.join("\r\n");
}

// Sanitize a suggested filename (the save dialog rejects some characters).
export function csvFilename(parts: string[]): string {
  return parts.join(" - ").replace(/[<>:"/\\|?*]/g, "-").slice(0, 120) + ".csv";
}
