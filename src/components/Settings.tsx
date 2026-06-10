import React, { useEffect, useRef, useState } from "react";
import Spinner from "./Spinner";

export default function Settings({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [demos, setDemos] = useState<{ folder: string | null; detected: string | null } | null>(null);
  const [editingUploader, setEditingUploader] = useState(false);
  const [uploadKey, setUploadKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const downOnBackdrop = useRef(false);

  const refresh = () => {
    window.api.keyStatus().then(setStatus);
    window.api.getDemosFolder().then(setDemos);
  };
  useEffect(refresh, []);

  // Esc closes the modal (unless a key save is in flight)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [busy, onClose]);

  const demoPath = demos?.folder || demos?.detected || null;

  const saveUploader = async () => {
    setBusy(true); setErr(null);
    const r = await window.api.setUploaderKey(uploadKey.trim());
    setBusy(false);
    if (r.ok) { setEditingUploader(false); setUploadKey(""); refresh(); onChanged(); }
    else setErr(r.status === 401 ? "That key was rejected (401)." : r.error || "Failed.");
  };
  const useOneAccount = async () => { await window.api.clearUploader(); setEditingUploader(false); refresh(); onChanged(); };

  return (
    <div
      className="modal-back"
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Settings</h3>

        <div className="settings-section">
          <div className="settings-label">Rocket League Demos folder</div>
          <div className="muted" style={{ wordBreak: "break-all", marginBottom: 6 }}>
            {demoPath || "Not set — detected automatically or asked for on first download."}
            {!demos?.folder && demos?.detected ? <span className="muted"> (auto-detected)</span> : null}
          </div>
          <button onClick={async () => { const r = await window.api.setDemosFolder(); if (r.ok) refresh(); }}>Change folder…</button>
        </div>

        <div className="settings-section">
          <div className="settings-label">Accounts</div>
          {!editingUploader ? (
            <>
              <div className="muted" style={{ marginBottom: 6 }}>
                {status?.separateAccounts
                  ? <>Separate accounts: managing as <b>{status?.identity?.name}</b>, uploading as <b>{status?.uploaderName || status?.uploaderId}</b>.</>
                  : "One account — you upload and manage with the same key."}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button onClick={() => setEditingUploader(true)}>{status?.separateAccounts ? "Change uploading key" : "Use a separate uploading account"}</button>
                {status?.separateAccounts && <button onClick={useOneAccount}>Switch to one account</button>}
              </div>
            </>
          ) : (
            <>
              <div className="muted" style={{ marginBottom: 6 }}>Enter the uploading account's API key:</div>
              <div className="row">
                <input type="password" placeholder="Uploading account API key" value={uploadKey} autoFocus
                  onChange={(e) => setUploadKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && uploadKey.trim() && saveUploader()} />
                <button className="primary" disabled={!uploadKey.trim() || busy} onClick={saveUploader}>{busy ? <Spinner small /> : "Save"}</button>
                <button disabled={busy} onClick={() => { setEditingUploader(false); setErr(null); }}>Cancel</button>
              </div>
              {err ? <div className="err">{err}</div> : null}
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
