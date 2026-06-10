import React, { useEffect, useMemo, useState } from "react";
import StatTable, { StatRow } from "./StatTable";
import ReplayList from "./ReplayList";
import Spinner from "./Spinner";
import { TABS, colValue } from "../lib/columns";

type Section = "players" | "teams" | "replays";

export default function GroupDetail({
  groupId,
  me,
  onOpenReplay,
  onGroupCreated,
  onOpenGroup
}: {
  groupId: string;
  me?: { id?: string | null; name?: string | null };
  onOpenReplay: (id: string) => void;
  onGroupCreated?: () => void;
  onOpenGroup?: (g: { id: string; name: string }) => void;
}) {
  const [section, setSection] = useState<Section>("players");
  const [catId, setCatId] = useState("core");
  const [mode, setMode] = useState<"game_average" | "cumulative">("game_average");
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setGroup(null);
    window.api.getGroup(groupId).then((res) => {
      if (!alive) return;
      setLoading(false);
      setStale(!!res.stale);
      if (res.ok) setGroup(res.data);
    });
    return () => { alive = false; };
  }, [groupId]);

  const tab = TABS.find((t) => t.id === catId) || TABS[0];
  const columns = tab.columns;

  const playerRows: StatRow[] = useMemo(() => {
    const players = (group && group.players) || [];
    return players.map((p: any, i: number) => {
      const statsRoot = p[mode] || {};
      const values: Record<string, number> = {};
      for (const c of columns) values[c.id] = colValue(c, statsRoot, p.cumulative);
      return { id: (p.id?.id || p.name || i) + ":" + i, label: p.name || "Unknown", sub: p.team || undefined, values };
    });
  }, [group, mode, columns]);

  const teamRows: StatRow[] = useMemo(() => {
    const players = (group && group.players) || [];
    const byTeam: Record<string, any[]> = {};
    for (const p of players) (byTeam[p.team || "—"] ||= []).push(p);
    return Object.entries(byTeam).map(([team, members]) => {
      const values: Record<string, number> = {};
      for (const c of columns) {
        const vals = members.map((p) => colValue(c, p[mode] || {}, p.cumulative)).filter((v) => Number.isFinite(v));
        if (!vals.length) { values[c.id] = NaN; continue; }
        const sum = vals.reduce((a, b) => a + b, 0);
        // sum raw counts in Total mode; average rates/percentages otherwise
        values[c.id] = mode === "cumulative" && !c.scalar ? sum : sum / vals.length;
      }
      return { id: "team:" + team, label: team, sub: `${members.length} players`, values };
    });
  }, [group, mode, columns]);

  return (
    <div className="content" style={{ minHeight: 0 }}>
      <div className="subtabs">
        {(["players", "teams", "replays"] as Section[]).map((s) => (
          <div key={s} className={"tab" + (section === s ? " active" : "")} onClick={() => setSection(s)}>
            {s === "players" ? "Players stats" : s === "teams" ? "Teams stats" : "Replays"}
          </div>
        ))}
      </div>

      {section !== "replays" && (
        <div className="subtabs cats">
          {TABS.map((t) => (
            <div key={t.id} className={"tab" + (catId === t.id ? " active" : "")} onClick={() => setCatId(t.id)}>{t.label}</div>
          ))}
          <div style={{ flex: 1 }} />
          <div className="toggle">
            <button className={mode === "game_average" ? "on" : ""} onClick={() => setMode("game_average")}>Average</button>
            <button className={mode === "cumulative" ? "on" : ""} onClick={() => setMode("cumulative")}>Total</button>
          </div>
        </div>
      )}

      {stale && <div className="muted" style={{ padding: "4px 12px" }}>Showing cached data (offline / refreshing)…</div>}

      {loading && !group ? (
        <div className="center"><Spinner label="Loading group stats…" /></div>
      ) : section === "replays" ? (
        <ReplayList params={{ group: groupId, count: 200 }} me={me} onOpenReplay={onOpenReplay} onGroupCreated={onGroupCreated} onOpenGroup={onOpenGroup} />
      ) : section === "players" ? (
        <StatTable columns={columns} rows={playerRows} />
      ) : (
        <StatTable columns={columns} rows={teamRows} nameHeader="Team" />
      )}
    </div>
  );
}
