import React, { useState } from "react";
import Spinner from "./Spinner";

// Large upload target at the top of the sidebar: drop .replay files onto it, or
// click to browse (opens in the Demos folder by default). Uploads use the
// uploading account's key when separate accounts are configured.
export default function UploadZone({ onUploaded }: { onUploaded?: () => void }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const uploadPaths = async (paths: string[]) => {
    const replays = paths.filter((p) => p.toLowerCase().endsWith(".replay"));
    if (replays.length === 0) { setProgress("No .replay files."); setTimeout(() => setProgress(null), 2500); return; }
    setBusy(true);
    let done = 0, dup = 0, failed = 0;
    for (const p of replays) {
      setProgress(`Uploading ${done + 1}/${replays.length}…`);
      const res = await window.api.uploadReplay(p, { visibility: "public" });
      if (res.ok) { done++; if (res.duplicate) dup++; } else failed++;
    }
    setBusy(false);
    setProgress(`Uploaded ${done - dup} new${dup ? `, ${dup} already existed` : ""}${failed ? `, ${failed} failed` : ""}.`);
    setTimeout(() => setProgress(null), 4000);
    onUploaded && onUploaded();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false);
    if (busy) return;
    const paths: string[] = [];
    for (const f of Array.from(e.dataTransfer.files)) {
      const p = window.api.pathForFile(f);
      if (p) paths.push(p);
    }
    if (paths.length) uploadPaths(paths);
  };

  const browse = async () => {
    if (busy) return;
    const res = await window.api.pickUploadFiles();
    if (res.ok && res.files && res.files.length) uploadPaths(res.files);
  };

  return (
    <div
      className={"upload-zone" + (over ? " over" : "") + (busy ? " busy" : "")}
      onClick={browse}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      title="Drop .replay files here, or click to browse"
    >
      {busy ? <Spinner small /> : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V7" /><path d="M7 11l5-5 5 5" /><path d="M5 21h14" />
        </svg>
      )}
      <div className="upload-text">
        <div><b>Upload replays</b></div>
        <div className="muted" style={{ fontSize: 10 }}>{progress || "drop files or click to browse"}</div>
      </div>
    </div>
  );
}
