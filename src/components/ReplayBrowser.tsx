import React, { useState } from "react";
import ReplayList from "./ReplayList";

const PLAYLISTS = [
  "", "ranked-duels", "ranked-doubles", "ranked-standard", "ranked-solo-standard",
  "unranked-duels", "unranked-doubles", "unranked-standard", "unranked-chaos",
  "tournament", "private"
];
const RANKS = [
  "", "bronze-1", "bronze-2", "bronze-3", "silver-1", "silver-2", "silver-3",
  "gold-1", "gold-2", "gold-3", "platinum-1", "platinum-2", "platinum-3",
  "diamond-1", "diamond-2", "diamond-3", "champion-1", "champion-2", "champion-3",
  "grand-champion-1", "grand-champion-2", "grand-champion-3", "supersonic-legend"
];

export default function ReplayBrowser({
  me,
  separateAccounts = false,
  uploaderFilter = "me",
  onOpenReplay,
  onGroupCreated,
  onOpenGroup
}: {
  me?: { id?: string | null; name?: string | null };
  separateAccounts?: boolean;
  uploaderFilter?: string;
  onOpenReplay: (id: string) => void;
  onGroupCreated?: () => void;
  onOpenGroup?: (g: { id: string; name: string }) => void;
}) {
  // "Only games I'm in" is on by default.
  const [onlyMine, setOnlyMine] = useState(true);
  const baseFilters = () => {
    const f: any = { uploader: uploaderFilter, count: 200, "sort-by": "replay-date", "sort-dir": "desc" };
    if (onlyMine && me?.name) f["player-name"] = me.name;
    return f;
  };
  const [f, setF] = useState<any>(baseFilters());
  const [applied, setApplied] = useState<any>(baseFilters());

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const apply = () => {
    const merged = { ...f };
    if (onlyMine && me?.name && !merged["player-name"]) merged["player-name"] = me.name;
    else if (!onlyMine && merged["player-name"] === me?.name) delete merged["player-name"];
    setApplied(merged);
  };
  // Toggling the box adds/removes the auto player-name filter and applies immediately.
  const toggleOnlyMine = (checked: boolean) => {
    setOnlyMine(checked);
    const n = { ...f };
    if (checked && me?.name) n["player-name"] = me.name;
    else if (!checked && n["player-name"] === me?.name) delete n["player-name"];
    setF(n);
    setApplied(n);
  };

  return (
    <div className="content" style={{ minHeight: 0 }}>
      <div className="toolbar">
        <label>Player name<input value={f["player-name"] || ""} onChange={(e) => set("player-name", e.target.value)} /></label>
        <label>Playlist
          <select value={f.playlist || ""} onChange={(e) => set("playlist", e.target.value)}>
            {PLAYLISTS.map((p) => <option key={p} value={p}>{p || "any"}</option>)}
          </select>
        </label>
        <label>Season<input style={{ width: 60 }} value={f.season || ""} onChange={(e) => set("season", e.target.value)} placeholder="14 / f9" /></label>
        <label>Result
          <select value={f["match-result"] || ""} onChange={(e) => set("match-result", e.target.value)}>
            <option value="">any</option><option value="win">win</option><option value="loss">loss</option>
          </select>
        </label>
        <label>Min rank
          <select value={f["min-rank"] || ""} onChange={(e) => set("min-rank", e.target.value)}>
            {RANKS.map((r) => <option key={r} value={r}>{r || "any"}</option>)}
          </select>
        </label>
        <label>Max rank
          <select value={f["max-rank"] || ""} onChange={(e) => set("max-rank", e.target.value)}>
            {RANKS.map((r) => <option key={r} value={r}>{r || "any"}</option>)}
          </select>
        </label>
        <label>Uploader
          <select value={f.uploader ?? "me"} onChange={(e) => set("uploader", e.target.value)}>
            <option value="me">{separateAccounts ? "me (managing)" : "me"}</option>
            {separateAccounts && uploaderFilter !== "me" ? <option value={uploaderFilter}>my uploader</option> : null}
            <option value="">anyone</option>
          </select>
        </label>
        <label>Played after<input type="date" value={f["replay-date-after"]?.slice(0, 10) || ""}
          onChange={(e) => set("replay-date-after", e.target.value ? e.target.value + "T00:00:00Z" : "")} /></label>
        <label>Played before<input type="date" value={f["replay-date-before"]?.slice(0, 10) || ""}
          onChange={(e) => set("replay-date-before", e.target.value ? e.target.value + "T23:59:59Z" : "")} /></label>
        <label>Sort
          <select value={f["sort-by"]} onChange={(e) => set("sort-by", e.target.value)}>
            <option value="replay-date">replay date</option><option value="upload-date">upload date</option>
          </select>
        </label>
        <label className="filter-check">
          <input type="checkbox" className="chk" checked={onlyMine} onChange={(e) => toggleOnlyMine(e.target.checked)} />
          Only games I'm in
        </label>
        <button className="primary" onClick={apply}>Apply filters</button>
      </div>
      <ReplayList params={applied} me={me} onOpenReplay={onOpenReplay} onGroupCreated={onGroupCreated} onOpenGroup={onOpenGroup} />
    </div>
  );
}
