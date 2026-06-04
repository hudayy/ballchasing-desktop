import React, { useMemo, useState } from "react";
import { fmt } from "../lib/stats";
import { cellColor, columnStats } from "../lib/heat";
import { Col } from "../lib/columns";

export interface StatRow {
  id: string;
  label: string;      // first-column label (player / team name)
  sub?: string;
  values: Record<string, number>;
}

export default function StatTable({
  columns,
  rows
}: {
  columns: Col[];
  rows: StatRow[];
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const colStats = useMemo(() => {
    const m: Record<string, { min: number; max: number }> = {};
    for (const c of columns) m[c.id] = columnStats(rows.map((r) => r.values[c.id]).filter((v) => Number.isFinite(v)));
    return m;
  }, [rows, columns]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const av = a.values[sortKey] ?? -Infinity;
      const bv = b.values[sortKey] ?? -Infinity;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, sortKey, sortDir]);

  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  if (rows.length === 0) return <div className="pad muted">No data.</div>;

  return (
    <div className="tablewrap">
      <table className="stat">
        <thead>
          <tr>
            <th onClick={() => setSortKey(null)} title="Name">Player</th>
            {columns.map((c) => (
              <th key={c.id} title={c.label} onClick={() => toggleSort(c.id)}>
                {c.label}{sortKey === c.id ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r) => (
            <tr key={r.id}>
              <td title={r.sub || ""}>
                {r.label}
                {r.sub ? <div className="muted" style={{ fontSize: 10 }}>{r.sub}</div> : null}
              </td>
              {columns.map((c) => {
                const v = r.values[c.id];
                const bg = c.scalar === "games" ? undefined : cellColor(v, colStats[c.id], !!c.lower, true);
                return (
                  <td key={c.id} style={bg ? { background: bg } : undefined}>
                    {Number.isFinite(v) ? fmt(v) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
