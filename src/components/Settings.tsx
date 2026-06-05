import React, { useEffect, useRef, useState } from "react";
import UploaderPicker from "./UploaderPicker";

export default function Settings({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [demos, setDemos] = useState<{ folder: string | null; detected: string | null } | null>(null);
  const [changingUploader, setChangingUploader] = useState(false);
  const downOnBackdrop = useRef(false);

  const refresh = () => {
    window.api.keyStatus().then(setStatus);
    window.api.getDemosFolder().then(setDemos);
  };
  useEffect(refresh, []);

  const demoPath = demos?.folder || demos?.detected || null;

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
            {demoPath ? demoPath : "Not set — will be detected or asked for on first download."}
            {!demos?.folder && demos?.detected ? <span className="muted"> (auto-detected)</span> : null}
          </div>
          <button onClick={async () => { const r = await window.api.setDemosFolder(); if (r.ok) refresh(); }}>Change folder…</button>
        </div>

        <div className="settings-section">
          <div className="settings-label">Primary uploader</div>
          {!changingUploader ? (
            <>
              <div className="muted" style={{ marginBottom: 6 }}>
                {status?.isPrimaryUploader
                  ? "You upload your own replays."
                  : <>Using <b>{status?.uploaderName || status?.uploaderId}</b>'s uploads{status?.hasUploaderKey ? " (via their API key)" : ""}.</>}
              </div>
              <button onClick={() => setChangingUploader(true)}>Change uploader</button>
            </>
          ) : (
            <UploaderPicker
              allowOwn
              onDone={() => { setChangingUploader(false); refresh(); onChanged(); }}
            />
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
