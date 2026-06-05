import React, { useEffect, useState } from "react";
import Spinner from "./Spinner";

// Lets a user who isn't their own uploader choose their primary uploader:
//  - pick from their 3 most recent uploaders (one click), or
//  - enter a Steam ID or an API key manually.
export default function UploaderPicker({
  onDone,
  allowOwn
}: {
  onDone: () => void;
  allowOwn?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [uploaders, setUploaders] = useState<{ id: string; name: string }[]>([]);
  const [manual, setManual] = useState(false);
  const [mode, setMode] = useState<"id" | "key">("id");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    window.api.recentUploaders().then((r) => {
      setLoading(false);
      if (r.ok && r.uploaders) setUploaders(r.uploaders);
    });
  }, []);

  const pick = async (u: { id: string; name: string }) => {
    setBusy(true);
    await window.api.setUploaderById(u.id, u.name);
    setBusy(false);
    onDone();
  };

  const submitManual = async () => {
    const v = value.trim();
    if (!v) return;
    setBusy(true); setErr(null);
    if (mode === "id") {
      await window.api.setUploaderById(v);
      setBusy(false); onDone();
    } else {
      const r = await window.api.setUploaderKey(v);
      setBusy(false);
      if (r.ok) onDone();
      else setErr(r.status === 401 ? "That API key was rejected (401)." : r.error || "Failed to validate key.");
    }
  };

  if (loading) return <div className="pad"><Spinner label="Finding your recent uploaders…" /></div>;

  return (
    <div className="uploader-picker">
      {!manual && (
        <>
          {uploaders.length > 0 ? (
            <>
              <p className="muted">Pick the person who uploads your replays:</p>
              <div className="uploader-list">
                {uploaders.map((u) => (
                  <button key={u.id} className="uploader-chip" disabled={busy} onClick={() => pick(u)}>
                    <span className="who">{u.name}</span>
                    <span className="muted small">Steam {u.id}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">We couldn't find recent uploaders automatically. Enter your uploader manually below.</p>
          )}
          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setManual(true)}>None of these are my primary uploader</button>
            {allowOwn && <button onClick={async () => { await window.api.clearUploader(); onDone(); }}>I upload my own replays</button>}
          </div>
        </>
      )}

      {manual && (
        <>
          <p className="muted">Enter your primary uploader's Steam ID or their API key:</p>
          <div className="row" style={{ gap: 12, marginBottom: 8 }}>
            <label className="radio"><input type="radio" checked={mode === "id"} onChange={() => setMode("id")} /> Steam ID</label>
            <label className="radio"><input type="radio" checked={mode === "key"} onChange={() => setMode("key")} /> API key</label>
          </div>
          <div className="row">
            <input
              type={mode === "key" ? "password" : "text"}
              placeholder={mode === "id" ? "SteamID64, e.g. 76561198…" : "Their ballchasing API key"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && value.trim() && submitManual()}
            />
            <button className="primary" disabled={!value.trim() || busy} onClick={submitManual}>{busy ? <Spinner small /> : "Set uploader"}</button>
          </div>
          <p style={{ marginTop: 8 }}><a href="#" onClick={(e) => { e.preventDefault(); setManual(false); setErr(null); }}>← back to suggestions</a></p>
        </>
      )}

      {err ? <div className="err">{err}</div> : null}
    </div>
  );
}
