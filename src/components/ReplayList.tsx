import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toSummary } from "../lib/normalize";
import {
  detectSeries, suggestNames, seriesScoreLine, Series, ReplaySummary, teamNameFallback,
  detectSessions, suggestSessionNames, sessionTitle, GroupRef
} from "../lib/series";
import SeriesModal from "./SeriesModal";
import Spinner from "./Spinner";

interface Cluster {
  key: string;
  kind: "series" | "session";
  replays: ReplaySummary[];
  title: string;
  suggestions: string[];
  existingGroup: GroupRef | null;
}

export default function ReplayList({
  params,
  onOpenReplay,
  me,
  onGroupCreated,
  onOpenGroup
}: {
  params: any;
  onOpenReplay: (id: string) => void;
  me?: { id?: string | null; name?: string | null };
  onGroupCreated?: () => void;
  onOpenGroup?: (g: { id: string; name: string }) => void;
}) {
  const [replays, setReplays] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ suggestions: string[]; ids: string[] } | null>(null);
  const anchorRef = useRef<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true); setErr(null);
    const res = await window.api.listReplays(params, force ? { force: true } : undefined);
    setLoading(false);
    if (res.ok) setReplays((res.data && res.data.list) || []);
    else setErr(res.error || "Failed to load replays");
  }, [JSON.stringify(params)]);

  useEffect(() => { setSelected(new Set()); load(); }, [load]);

  // periodic background re-check + refresh on window focus (item 1)
  useEffect(() => {
    const h = setInterval(() => load(true), 120000);
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(h); window.removeEventListener("focus", onFocus); };
  }, [load]);

  const summaries: ReplaySummary[] = useMemo(() => replays.map(toSummary), [replays]);

  // Unified clusters: private-match SERIES (blue / green-if-grouped) + matchmaking
  // SESSIONS (purple / green-if-grouped). They never overlap (different playlists).
  const clusters: Cluster[] = useMemo(() => {
    const user = { myId: me?.id, myName: me?.name };
    const out: Cluster[] = [];
    for (const s of detectSeries(summaries, user)) {
      out.push({
        key: "s:" + s.id, kind: "series", replays: s.replays,
        title: s.existingGroup ? s.existingGroup.name : seriesScoreLine(s),
        suggestions: suggestNames(s), existingGroup: s.existingGroup
      });
    }
    for (const s of detectSessions(summaries, user)) {
      out.push({
        key: "ss:" + s.id, kind: "session", replays: s.replays,
        title: s.existingGroup ? s.existingGroup.name : sessionTitle(s),
        suggestions: suggestSessionNames(s), existingGroup: s.existingGroup
      });
    }
    return out;
  }, [summaries, me?.id, me?.name]);

  const seriesOf = useMemo(() => {
    const m: Record<string, Cluster> = {};
    clusters.forEach((c) => c.replays.forEach((r) => (m[r.id] = c)));
    return m;
  }, [clusters]);
  const byId = useMemo(() => {
    const m: Record<string, any> = {}; replays.forEach((r) => (m[r.id] = r)); return m;
  }, [replays]);

  const ordered = useMemo(() => [...replays].sort((a, b) =>
    (Date.parse(b.date || b.created || "") || 0) - (Date.parse(a.date || a.created || "") || 0)), [replays]);

  // visual order of replay ids (series grouped contiguously) — drives shift-select
  const visualOrder = useMemo(() => {
    const seen = new Set<string>(); const order: string[] = [];
    for (const r of ordered) {
      if (seen.has(r.id)) continue;
      const s = seriesOf[r.id];
      if (s) {
        [...s.replays].sort((a, b) => (Date.parse(b.date || "") || 0) - (Date.parse(a.date || "") || 0))
          .forEach((rr) => { if (!seen.has(rr.id)) { seen.add(rr.id); order.push(rr.id); } });
      } else { seen.add(r.id); order.push(r.id); }
    }
    return order;
  }, [ordered, seriesOf]);

  const onCheck = (id: string, shift: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (shift && anchorRef.current) {
        const a = visualOrder.indexOf(anchorRef.current);
        const b = visualOrder.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) n.add(visualOrder[i]);
          return n;
        }
      }
      n.has(id) ? n.delete(id) : n.add(id);
      anchorRef.current = id;
      return n;
    });
  };

  const selectCluster = (c: Cluster) => { setSelected(new Set(c.replays.map((r) => r.id))); anchorRef.current = c.replays[0].id; };
  const openCreateModal = (c: Cluster) => { selectCluster(c); setModal({ suggestions: c.suggestions, ids: c.replays.map((r) => r.id) }); };
  const createFromSelection = () => {
    const ids = Array.from(selected); if (!ids.length) return;
    const c = clusters.find((x) => x.replays.length === ids.length && x.replays.every((r) => selected.has(r.id)));
    setModal({ suggestions: c ? c.suggestions : ["New group"], ids });
  };

  // ---- bulk actions ----
  const doDownload = async () => {
    setBusy(true);
    const res = await window.api.downloadReplays(Array.from(selected));
    setBusy(false);
    if (res.ok) alert(`Downloaded ${res.done} replay(s)${res.failed ? `, ${res.failed} failed` : ""} to:\n${res.dir}`);
    else if (!res.canceled) alert("Download failed: " + (res.error || "unknown"));
  };
  const doDelete = async () => {
    const ids = Array.from(selected);
    if (!confirm(`Delete ${ids.length} replay(s)? This cannot be undone.`)) return;
    setBusy(true);
    for (const id of ids) await window.api.deleteReplay(id);
    setBusy(false); setSelected(new Set()); load(true);
  };
  const doVisibility = async (vis: string) => {
    if (!vis) return;
    const ids = Array.from(selected);
    setBusy(true);
    for (const id of ids) await window.api.patchReplay(id, { visibility: vis });
    setBusy(false); load(true);
  };

  if (loading && replays.length === 0) return <div className="center"><Spinner label="Loading replays…" /></div>;
  if (err) return <div className="pad" style={{ color: "#ff9a9d" }}>{err}</div>;
  if (replays.length === 0) return <div className="pad muted">No replays match.</div>;

  // ---- build render blocks ----
  const rendered = new Set<string>();
  const blocks: React.ReactNode[] = [];

  const replayRow = (r: any) => {
    const sm = toSummary(r);
    const blueName = sm.blue.name || teamNameFallback(sm.blue);
    const orangeName = sm.orange.name || teamNameFallback(sm.orange);
    const blueWon = sm.blue.goals > sm.orange.goals;
    return (
      <div className="replay-row" key={r.id} onClick={() => onOpenReplay(r.id)}>
        <input type="checkbox" className="chk" checked={selected.has(r.id)} readOnly
          onClick={(e) => { e.stopPropagation(); onCheck(r.id, (e as any).shiftKey); }} />
        <div>
          <div>{r.replay_title || `${blueName} vs ${orangeName}`}</div>
          <div className="muted" style={{ fontSize: 11 }}>
            {r.map_name || r.map_code} · {r.playlist_name || r.playlist_id} · {r.date ? new Date(r.date).toLocaleString() : ""}
            {r.visibility && r.visibility !== "public" ? ` · ${r.visibility}` : ""}
          </div>
        </div>
        <div className="score" style={{ color: blueWon ? "#7ec0ff" : "#5aa9ff", opacity: blueWon ? 1 : 0.6 }}>{sm.blue.goals}</div>
        <div className="muted">–</div>
        <div className="score" style={{ color: !blueWon ? "#ffae85" : "#ff8a5a", opacity: !blueWon ? 1 : 0.6 }}>{sm.orange.goals}</div>
      </div>
    );
  };

  for (const r of ordered) {
    if (rendered.has(r.id)) continue;
    const c = seriesOf[r.id];
    if (c) {
      c.replays.forEach((rr) => rendered.add(rr.id));
      const games = [...c.replays].sort((a, b) => (Date.parse(b.date || "") || 0) - (Date.parse(a.date || "") || 0));
      const existing = c.existingGroup;
      const boxClass = "series-box" + (existing ? " existing" : c.kind === "session" ? " session" : "");
      const label = c.kind === "session" ? "🎮 Session:" : "⛓ Series:";
      const unit = c.kind === "session" ? "games" : "games";
      blocks.push(
        <div className={boxClass} key={c.key}>
          <div className="series-head">
            <b>{label}</b>
            <span className="series-score">{c.title}</span>
            <span className="muted">({c.replays.length} {unit})</span>
            <div style={{ flex: 1 }} />
            {existing ? (
              <button onClick={() => onOpenGroup && onOpenGroup(existing)}>Open group</button>
            ) : (
              <>
                <button onClick={() => selectCluster(c)}>Select {c.kind}</button>
                <button className="primary" onClick={() => openCreateModal(c)}>Add to group…</button>
              </>
            )}
          </div>
          <div className="series-games">{games.map((g) => replayRow(byId[g.id]))}</div>
        </div>
      );
    } else {
      blocks.push(replayRow(r));
    }
  }

  const newSeries = clusters.filter((c) => c.kind === "series" && !c.existingGroup).length;
  const newSessions = clusters.filter((c) => c.kind === "session" && !c.existingGroup).length;
  const existingClusters = clusters.filter((c) => c.existingGroup).length;

  return (
    <div className="content" style={{ minHeight: 0 }}>
      <div className="toolbar">
        <span className="muted">
          {replays.length} replays · {newSeries} series · {newSessions} sessions
          {existingClusters ? ` · ${existingClusters} already grouped` : ""}
          {loading ? " · " : ""}{loading ? <Spinner small /> : null}
        </span>
        <div style={{ flex: 1 }} />
        {selected.size > 0 && (
          <>
            <span className="muted">{selected.size} selected</span>
            <button className="primary" onClick={createFromSelection} disabled={busy}>＋ Add to group…</button>
            <button title="Download .replay files" onClick={doDownload} disabled={busy}>⬇</button>
            <select className="visibility" defaultValue="" title="Set visibility" disabled={busy}
              onChange={(e) => { doVisibility(e.target.value); e.target.value = ""; }}>
              <option value="" disabled>👁 Visibility…</option>
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
            <button className="danger" title="Delete selected" onClick={doDelete} disabled={busy}>🗑</button>
            <button onClick={() => setSelected(new Set())} disabled={busy}>Clear</button>
            {busy ? <Spinner small /> : null}
          </>
        )}
      </div>

      <div style={{ overflow: "auto", flex: 1, padding: "0 8px" }}>{blocks}</div>

      {modal && (
        <SeriesModal suggestions={modal.suggestions} replayIds={modal.ids}
          onClose={() => setModal(null)}
          onCreated={() => { setSelected(new Set()); load(true); onGroupCreated && onGroupCreated(); }} />
      )}
    </div>
  );
}
