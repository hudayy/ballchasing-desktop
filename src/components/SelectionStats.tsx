import React, { useEffect, useMemo, useRef, useState } from "react";
import StatTable, { StatRow } from "./StatTable";
import Spinner from "./Spinner";
import { TABS, Col, colValue } from "../lib/columns";
import { buildCsv, csvFilename } from "../lib/csv";
import { toast } from "../lib/toast";

// Combined per-player stats across an arbitrary selection of replays — like a
// group's players-stats table, but computed client-side so no group has to be
// created. Each replay's full stats are fetched (cached 24h) and aggregated.

interface Agg { name: string; teams: Set<string>; games: number; wins: number; sums: Record<string, number>; }

const teamGoals = (t: any): number =>
  t?.stats?.core?.goals ?? (t?.players || []).reduce((s: number, p: any) => s + (p.stats?.core?.goals || 0), 0);

// Rate-like stats (percentages, averages, per-minute) stay averaged in Total
// mode — summing them across games is meaningless.
const isRate = (c: Col) =>
  (c.key || "").includes("percent") || (c.key || "").startsWith("avg") ||
  c.id === "bpm" || c.id === "bcpm" || c.id === "avg_speed" || c.id === "psd";

export default function SelectionStats({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const [catId, setCatId] = useState("core");
  const [mode, setMode] = useState<"avg" | "total">("avg");
  const [progress, setProgress] = useState(0);
  const [agg, setAgg] = useState<Record<string, Agg> | null>(null);
  const [failed, setFailed] = useState(0);
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, Agg> = {};
      const cols = TABS.flatMap((t) => t.columns).filter((c) => !c.scalar);
      let fail = 0, done = 0;
      await Promise.all(ids.map(async (id) => {
        const res = await window.api.getReplay(id); // paced by the shared scheduler
        done++;
        if (alive) setProgress(done);
        const d = res.ok ? res.data : null;
        if (!d || d.status === "pending" || !d.blue || !d.orange) { fail++; return; }
        for (const [team, other] of [[d.blue, d.orange], [d.orange, d.blue]]) {
          const tg = teamGoals(team), og = teamGoals(other);
          for (const p of team.players || []) {
            const key = p.id && p.id.id ? `${p.id.platform || ""}:${p.id.id}` : (p.name || "?");
            const a = (out[key] ||= { name: p.name || "Unknown", teams: new Set(), games: 0, wins: 0, sums: {} });
            a.games++;
            if (tg > og) a.wins++;
            if (team.name) a.teams.add(team.name);
            for (const c of cols) {
              const v = colValue(c, p.stats || {}, null);
              if (Number.isFinite(v)) a.sums[c.id] = (a.sums[c.id] || 0) + v;
            }
          }
        }
      }));
      if (alive) { setFailed(fail); setAgg(out); }
    })();
    return () => { alive = false; };
  }, [JSON.stringify(ids)]);

  const tab = TABS.find((t) => t.id === catId) || TABS[0];

  const rows: StatRow[] = useMemo(() => {
    if (!agg) return [];
    return Object.entries(agg)
      .map(([key, a]) => {
        const values: Record<string, number> = {};
        for (const c of tab.columns) {
          if (c.scalar === "games") values[c.id] = a.games;
          else if (c.scalar === "win_percentage") values[c.id] = a.games ? (a.wins / a.games) * 100 : NaN;
          else {
            const sum = a.sums[c.id];
            if (!Number.isFinite(sum)) { values[c.id] = NaN; continue; }
            values[c.id] = mode === "total" && !isRate(c) ? sum : sum / a.games;
          }
        }
        const teams = Array.from(a.teams).join(", ");
        return { id: key, label: a.name, sub: teams || `${a.games} games`, values };
      })
      .sort((x, y) => (y.values.games || 0) - (x.values.games || 0));
  }, [agg, tab, mode]);

  const exportCsv = async () => {
    const r = await window.api.saveTextFile(
      csvFilename(["Selection stats", `${ids.length} replays`, tab.label, mode === "avg" ? "Average" : "Total"]),
      buildCsv("Player", tab.columns, rows)
    );
    if (r.ok) toast("Exported to " + r.path, "success");
    else if (!r.canceled) toast("Export failed: " + (r.error || "unknown"), "error");
  };

  return (
    <div
      className="modal-back"
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal xl" onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Combined stats</h3>
          <span className="muted">{ids.length} replays{failed ? ` · ${failed} failed to load` : ""}</span>
          <div style={{ flex: 1 }} />
          <button onClick={exportCsv} disabled={!agg || rows.length === 0} title="Export this table as CSV">⤓ CSV</button>
          <button onClick={onClose}>Close</button>
        </div>

        <div className="subtabs cats" style={{ paddingLeft: 0, paddingRight: 0 }}>
          {TABS.map((t) => (
            <div key={t.id} className={"tab" + (catId === t.id ? " active" : "")} onClick={() => setCatId(t.id)}>{t.label}</div>
          ))}
          <div style={{ flex: 1 }} />
          <div className="toggle">
            <button className={mode === "avg" ? "on" : ""} onClick={() => setMode("avg")}>Average</button>
            <button className={mode === "total" ? "on" : ""} onClick={() => setMode("total")}>Total</button>
          </div>
        </div>

        {!agg ? (
          <div className="center" style={{ height: 220 }}>
            <Spinner label={`Loading replay stats… ${progress}/${ids.length}`} />
          </div>
        ) : (
          <div className="selstats-table">
            <StatTable columns={tab.columns} rows={rows} />
          </div>
        )}
      </div>
    </div>
  );
}
