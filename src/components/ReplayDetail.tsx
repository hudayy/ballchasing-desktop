import React, { useEffect, useState } from "react";
import StatTable, { StatRow } from "./StatTable";
import Spinner from "./Spinner";
import { TABS, colValue } from "../lib/columns";

export default function ReplayDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [catId, setCatId] = useState("core");

  useEffect(() => {
    let alive = true;
    let timer: any;
    const load = async () => {
      const res = await window.api.getReplay(id);
      if (!alive) return;
      if (!res.ok) { setErr(res.error || "Failed"); return; }
      setData(res.data);
      if (res.data && res.data.status === "pending") timer = setTimeout(load, 2500);
    };
    setData(null); setErr(null); load();
    return () => { alive = false; clearTimeout(timer); };
  }, [id]);

  if (err) return <div className="pad" style={{ color: "#ff9a9d" }}><button onClick={onBack}>← Back</button><p>{err}</p></div>;
  if (!data) return <div className="center"><Spinner label="Loading replay…" /></div>;
  if (data.status === "pending") return <div className="center"><Spinner label="Replay is still processing on ballchasing… retrying." /></div>;

  const tab = TABS.find((t) => t.id === catId) || TABS[0];
  // per-replay: hide the Games / Win% scalar columns (not meaningful for one game)
  const columns = tab.columns.filter((c) => !c.scalar);

  const buildRows = (team: any): StatRow[] =>
    ((team && team.players) || []).map((p: any, i: number) => {
      const values: Record<string, number> = {};
      for (const c of columns) values[c.id] = colValue(c, p.stats || {}, null);
      return { id: (team.color || "t") + ":" + (p.id?.id || p.name || i), label: p.name + (p.mvp ? "  ⭐" : ""), sub: team.name || team.color || "", values };
    });

  const allRows = [...buildRows(data.blue), ...buildRows(data.orange)];
  const goals = (t: any) => t?.stats?.core?.goals ?? (t?.players || []).reduce((s: number, p: any) => s + (p.stats?.core?.goals || 0), 0);

  return (
    <div className="content" style={{ minHeight: 0 }}>
      <div className="toolbar">
        <button onClick={onBack}>← Back</button>
        <b>{data.title || data.replay_title || "Replay"}</b>
        <span className="muted">{data.map_name} · {data.playlist_name || data.playlist_id} · {data.date ? new Date(data.date).toLocaleString() : ""}</span>
        <div style={{ flex: 1 }} />
        <span className="score" style={{ color: "#5aa9ff" }}>{data.blue?.name || "Blue"} {goals(data.blue)}</span>
        <span className="muted">–</span>
        <span className="score" style={{ color: "#ff8a5a" }}>{goals(data.orange)} {data.orange?.name || "Orange"}</span>
        <button onClick={() => window.api.openExternal(`https://ballchasing.com/replay/${id}`)}>Open on web ↗</button>
      </div>
      <div className="subtabs cats">
        {TABS.map((t) => (
          <div key={t.id} className={"tab" + (catId === t.id ? " active" : "")} onClick={() => setCatId(t.id)}>{t.label}</div>
        ))}
      </div>
      <StatTable columns={columns} rows={allRows} />
    </div>
  );
}
