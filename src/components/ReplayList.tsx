import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toSummary } from "../lib/normalize";
import {
  detectSeries, suggestNames, seriesScoreLine, Series, ReplaySummary, teamNameFallback, userScore,
  detectSessions, suggestSessionNames, sessionTitle, sessionDiff, GroupRef
} from "../lib/series";
import SeriesModal from "./SeriesModal";
import Spinner from "./Spinner";
import { ScoreText, DiffChip } from "./ScoreText";
import { toast } from "../lib/toast";

interface Cluster {
  key: string;
  kind: "series" | "session";
  replays: ReplaySummary[];
  title: string;
  suggestions: string[];
  existingGroup: GroupRef | null;
  diff?: number; // sessions only: user game differential
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
  const [dlMenu, setDlMenu] = useState(false);
  const [next, setNext] = useState<string | null>(null); // API's next-page URL
  const [loadingMore, setLoadingMore] = useState(false);
  const anchorRef = useRef<string | null>(null);
  const pagesRef = useRef(1);

  const load = useCallback(async (force = false) => {
    setLoading(true); setErr(null);
    const res = await window.api.listReplays(params, force ? { force: true } : undefined);
    setLoading(false);
    if (res.ok) {
      setReplays((res.data && res.data.list) || []);
      setNext((res.data && res.data.next) || null);
      pagesRef.current = 1;
    } else setErr(res.error || "Failed to load replays");
  }, [JSON.stringify(params)]);

  useEffect(() => { setSelected(new Set()); load(); }, [load]);

  // periodic background re-check + refresh on window focus — skipped once the
  // user has paged deeper, so a refresh doesn't throw away loaded pages
  useEffect(() => {
    const refresh = () => { if (pagesRef.current === 1) load(true); };
    const h = setInterval(refresh, 120000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(h); window.removeEventListener("focus", refresh); };
  }, [load]);

  // fetch the next page (the API caps each response at 200) and append
  const loadMore = async () => {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    const p: any = {};
    try { new URL(next).searchParams.forEach((v, k) => { p[k] = k in p ? ([] as string[]).concat(p[k], v) : v; }); }
    catch { setLoadingMore(false); return; }
    const res = await window.api.listReplays(p);
    setLoadingMore(false);
    if (!res.ok) { toast("Failed to load more: " + (res.error || "unknown"), "error"); return; }
    const list: any[] = (res.data && res.data.list) || [];
    setReplays((prev) => {
      const have = new Set(prev.map((r: any) => r.id));
      return [...prev, ...list.filter((r: any) => !have.has(r.id))];
    });
    setNext((res.data && res.data.next) || null);
    pagesRef.current++;
  };

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
        suggestions: suggestSessionNames(s), existingGroup: s.existingGroup,
        diff: sessionDiff(s, user)
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
  // friendly download filename: "2026-06-08 21.43 - Title"
  const downloadName = (r: any): string => {
    const d = r.date ? new Date(r.date) : null;
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = d && !isNaN(d.getTime())
      ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`
      : "";
    const title = r.replay_title || r.map_name || r.id;
    return stamp ? `${stamp} - ${title}` : title;
  };
  const doDownload = async (mode: "choose" | "demos") => {
    setDlMenu(false);
    setBusy(true);
    const ids = Array.from(selected);
    const names: Record<string, string> = {};
    for (const id of ids) if (byId[id]) names[id] = downloadName(byId[id]);
    const res = await window.api.downloadReplays(ids, { mode, names });
    setBusy(false);
    if (res.ok) toast(`Downloaded ${res.done} replay(s)${res.failed ? `, ${res.failed} failed` : ""} to ${res.dir}`, res.failed ? "info" : "success");
    else if (!res.canceled) toast("Download failed: " + (res.error || "unknown"), "error");
  };
  const doDelete = async () => {
    const ids = Array.from(selected);
    if (!confirm(`Delete ${ids.length} replay(s)? This cannot be undone.`)) return;
    setBusy(true);
    let failed = 0;
    for (const id of ids) { const r = await window.api.deleteReplay(id); if (!r.ok) failed++; }
    setBusy(false); setSelected(new Set()); load(true);
    toast(failed ? `Deleted ${ids.length - failed}, ${failed} failed.` : `Deleted ${ids.length} replay(s).`, failed ? "error" : "success");
  };
  const doVisibility = async (vis: string) => {
    if (!vis) return;
    const ids = Array.from(selected);
    setBusy(true);
    let failed = 0;
    for (const id of ids) { const r = await window.api.patchReplay(id, { visibility: vis }); if (!r.ok) failed++; }
    setBusy(false); load(true);
    toast(failed ? `Set visibility on ${ids.length - failed}, ${failed} failed.` : `Set ${ids.length} replay(s) to ${vis}.`, failed ? "error" : "success");
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
    const us = userScore(sm, { myId: me?.id, myName: me?.name });
    const left = us.present ? us.mine : sm.blue.goals;
    const right = us.present ? us.theirs : sm.orange.goals;
    const cellClass = "score-cell" + (us.present ? (us.won ? " win" : " loss") : "");
    return (
      <div className="replay-row" key={r.id} onClick={() => onOpenReplay(r.id)}>
        <input type="checkbox" className="chk" checked={selected.has(r.id)} readOnly
          onClick={(e) => { e.stopPropagation(); onCheck(r.id, (e as any).shiftKey); }} />
        <div className={cellClass} title={us.present ? `you ${left}–${right}` : `${left}–${right}`}>
          <span className="score" style={{ color: us.present ? "#eaf1fb" : "#5aa9ff" }}>{left}</span>
          <span className="dash">–</span>
          <span className="score" style={{ color: us.present ? "#9fb0c6" : "#ff8a5a" }}>{right}</span>
        </div>
        <div className="replay-info">
          <div>{r.replay_title || `${blueName} vs ${orangeName}`}</div>
          <div className="muted" style={{ fontSize: 11 }}>
            {r.map_name || r.map_code} · {r.playlist_name || r.playlist_id} · {r.date ? new Date(r.date).toLocaleString() : ""}
            {r.visibility && r.visibility !== "public" ? ` · ${r.visibility}` : ""}
          </div>
        </div>
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
            <span className="series-score">
              {c.kind === "session" && typeof c.diff === "number" ? <DiffChip diff={c.diff} /> : null}
              <ScoreText text={c.title} />
            </span>
            <span className="muted">({c.replays.length} {unit})</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => selectCluster(c)}>Select</button>
            {existing ? (
              <button onClick={() => onOpenGroup && onOpenGroup(existing)}>Open group</button>
            ) : (
              <button className="primary" onClick={() => openCreateModal(c)}>Add to group…</button>
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
        <button title="Refresh" onClick={() => load(true)} disabled={loading}>⟳</button>
        <div style={{ flex: 1 }} />
        {selected.size > 0 && (
          <>
            <span className="muted">{selected.size} selected</span>
            <button className="primary" onClick={createFromSelection} disabled={busy}>＋ Add to group…</button>
            <span className="dl-wrap">
              <button title="Download .replay files" onClick={() => setDlMenu((v) => !v)} disabled={busy} aria-label="Download">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-2px" }}>
                  <path d="M12 3v11" /><path d="M7 9.5l5 5 5-5" /><path d="M5 21h14" />
                </svg>
              </button>
              {dlMenu && (
                <div className="dl-menu" onMouseLeave={() => setDlMenu(false)}>
                  <button onClick={() => doDownload("choose")}>Choose location…</button>
                  <button onClick={() => doDownload("demos")}>Add to Demos folder</button>
                </div>
              )}
            </span>
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

      <div style={{ overflow: "auto", flex: 1, padding: "0 8px" }}>
        {blocks}
        {next && (
          <button className="loadmore" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Spinner small /> : "Load more replays"}
          </button>
        )}
      </div>

      {modal && (
        <SeriesModal suggestions={modal.suggestions} replayIds={modal.ids}
          onClose={() => setModal(null)}
          onCreated={() => { setSelected(new Set()); load(true); onGroupCreated && onGroupCreated(); }} />
      )}
    </div>
  );
}
