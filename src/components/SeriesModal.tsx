import React, { useRef, useState } from "react";
import GroupPickerTree from "./GroupPickerTree";
import Spinner from "./Spinner";

export default function SeriesModal({
  suggestions,
  replayIds,
  onClose,
  onCreated
}: {
  suggestions: string[];
  replayIds: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState(suggestions[0] || "");
  const [parent, setParent] = useState<{ id: string; name: string } | null>(null);   // for new group
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);    // for add-to-existing
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  // Only dismiss when a click both STARTS and ENDS on the backdrop itself, so
  // drag-selecting text inside a field and releasing outside doesn't close it.
  const downOnBackdrop = useRef(false);

  const addReplays = async (gid: string) => {
    let done = 0;
    for (const id of replayIds) { setProgress(`Adding replays… ${done + 1}/${replayIds.length}`); await window.api.patchReplay(id, { group: gid }); done++; }
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "existing") {
        if (!target) { setBusy(false); return; }
        await addReplays(target.id);
      } else {
        if (!name.trim()) { setBusy(false); return; }
        setProgress("Creating group…");
        const body: any = { name: name.trim(), player_identification: "by-id", team_identification: "by-distinct-players" };
        if (parent) body.parent = parent.id;
        const res = await window.api.createGroup(body);
        if (!res.ok) { setProgress("Failed: " + res.error); setBusy(false); return; }
        await addReplays(res.data.id);
      }
      setProgress("Done."); onCreated(); onClose();
    } finally { setBusy(false); }
  };

  return (
    <div
      className="modal-back"
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Add series to a replay group</h3>
        <div className="muted">{replayIds.length} replays selected.</div>

        <div style={{ display: "flex", gap: 6, margin: "10px 0" }}>
          <button className={mode === "new" ? "primary" : ""} onClick={() => setMode("new")}>Create new group</button>
          <button className={mode === "existing" ? "primary" : ""} onClick={() => setMode("existing")}>Add to existing</button>
        </div>

        {mode === "new" ? (
          <>
            <div className="suggest">
              {suggestions.map((s) => (
                <button key={s} className={s === name ? "primary" : ""} onClick={() => setName(s)}>{s}</button>
              ))}
            </div>
            <input style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" />
            <div className="muted" style={{ margin: "10px 0 4px" }}>
              Place inside: <b>{parent ? parent.name : "— top level —"}</b>
              {parent ? <button style={{ marginLeft: 8 }} onClick={() => setParent(null)}>clear</button> : null}
            </div>
            <div className="picker-box">
              <GroupPickerTree selectedId={parent?.id || null} onSelect={setParent} />
            </div>
          </>
        ) : (
          <>
            <div className="muted" style={{ margin: "4px 0" }}>Target group: <b>{target ? target.name : "— choose —"}</b></div>
            <div className="picker-box">
              <GroupPickerTree selectedId={target?.id || null} onSelect={setTarget} />
            </div>
          </>
        )}

        {progress && <div className="muted" style={{ marginTop: 8 }}>{busy ? <Spinner small /> : null} {progress}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy || (mode === "new" ? !name.trim() : !target)}>
            {mode === "new" ? "Create group" : "Add to group"}
          </button>
        </div>
      </div>
    </div>
  );
}
