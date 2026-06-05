import React, { useCallback, useEffect, useRef, useState } from "react";
import KeyGate from "./components/KeyGate";
import RateMeter from "./components/RateMeter";
import GroupTree from "./components/GroupTree";
import GroupDetail from "./components/GroupDetail";
import ReplayBrowser from "./components/ReplayBrowser";
import ReplayDetail from "./components/ReplayDetail";
import Spinner from "./components/Spinner";
import UpdateBadge from "./components/UpdateBadge";
import Settings from "./components/Settings";
import UploadZone from "./components/UploadZone";

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [me, setMe] = useState<{ id?: string | null; name?: string | null }>({});
  const [separateAccounts, setSeparateAccounts] = useState(false);
  const [uploaderFilter, setUploaderFilter] = useState("me");
  const [selectedGroup, setSelectedGroup] = useState<{ id: string; name: string } | null>(null);
  const [browse, setBrowse] = useState(true); // global replay browser
  const [browseKey, setBrowseKey] = useState(0); // remount browser when uploader changes
  const [openReplay, setOpenReplay] = useState<string | null>(null);
  const [treeRefresh, setTreeRefresh] = useState(0);
  const [sidebarW, setSidebarW] = useState(330);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const applyStatus = (st: KeyStatus) => {
    setMe({ id: st.identity?.steam_id, name: st.identity?.name });
    setSeparateAccounts(!!st.separateAccounts);
    setUploaderFilter(st.uploaderFilter || "me");
  };

  useEffect(() => {
    (async () => {
      const st = await window.api.keyStatus();
      if (st.hasKey) { applyStatus(st); setAuthed(true); return; }
      setAuthed(false);
    })();
  }, []);

  // resizable sidebar
  const dragging = useRef(false);
  const onResizeDown = () => { dragging.current = true; document.body.style.cursor = "col-resize"; };
  useEffect(() => {
    const move = (e: MouseEvent) => { if (dragging.current) setSidebarW(Math.max(230, Math.min(620, e.clientX))); };
    const up = () => { dragging.current = false; document.body.style.cursor = ""; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);

  const refreshTree = useCallback(() => setTreeRefresh((n) => n + 1), []);
  const openGroup = (g: { id: string; name: string }) => { setSelectedGroup(g); setBrowse(false); setOpenReplay(null); };
  const openBrowse = () => { setSelectedGroup(null); setBrowse(true); setOpenReplay(null); };

  if (authed === null) return <div className="center"><Spinner label="Starting…" /></div>;
  if (!authed) return <KeyGate onAuthed={async () => {
    const st = await window.api.keyStatus();
    applyStatus(st);
    setAuthed(true);
  }} />;

  return (
    <div className="app">
      <div className="topbar">
        <span className="title">Ballchasing Desktop</span>
        <div className="spacer" />
        <div className="legend"><span>low</span><span className="swatch" /><span>high</span></div>
        <RateMeter />
        <UpdateBadge />
        <span className="identity">{me.name ? <>signed in as <b>{me.name}</b></> : "signed in"}{separateAccounts ? <span className="muted"> · separate upload account</span> : null}</span>
        <button title="Settings" onClick={() => setSettingsOpen(true)}>⚙</button>
        <button onClick={async () => { await window.api.clearKey(); setAuthed(false); }}>Sign out</button>
      </div>

      <div className="body">
        <div className="sidebar" style={{ width: sidebarW }}>
          <UploadZone onUploaded={refreshTree} />
          <div className={"browse-btn" + (browse ? " active" : "")} onClick={openBrowse}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-2px", marginRight: 7 }}>
              <rect x="3" y="4" width="18" height="5" rx="1.5" /><rect x="3" y="13" width="18" height="5" rx="1.5" />
            </svg>
            Browse all replays
          </div>
          <GroupTree
            selectedId={selectedGroup?.id || null}
            onSelect={(g) => { setSelectedGroup(g ? { id: g.id, name: g.name } : null); setBrowse(false); setOpenReplay(null); }}
            refreshSignal={treeRefresh}
          />
        </div>
        <div className="resizer" onMouseDown={onResizeDown} title="Drag to resize" />

        <div className="content-host">
          {openReplay ? (
            <ReplayDetail id={openReplay} onBack={() => setOpenReplay(null)} />
          ) : selectedGroup ? (
            <div className="content">
              <div className="toolbar">
                <b>{selectedGroup.name}</b>
                <span className="muted">group stats</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => window.api.openExternal(`https://ballchasing.com/group/${selectedGroup.id}`)}>Open on web ↗</button>
              </div>
              <GroupDetail groupId={selectedGroup.id} me={me} onOpenReplay={setOpenReplay} onGroupCreated={refreshTree} onOpenGroup={openGroup} />
            </div>
          ) : browse ? (
            <ReplayBrowser key={browseKey} me={me} separateAccounts={separateAccounts} uploaderFilter={uploaderFilter} onOpenReplay={setOpenReplay} onGroupCreated={refreshTree} onOpenGroup={openGroup} />
          ) : (
            <div className="content"><div className="empty-state">
              <div>Select a group from the tree, or click <b>Browse all replays</b>.</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Drag groups to re-parent (multi-select supported) · stat cells are heat-tinted · series are auto-detected in private-match replay lists.</div>
            </div></div>
          )}
        </div>
      </div>

      {settingsOpen && (
        <Settings
          onClose={() => setSettingsOpen(false)}
          onChanged={async () => { const st = await window.api.keyStatus(); applyStatus(st); setBrowseKey((n) => n + 1); refreshTree(); }}
        />
      )}
    </div>
  );
}
