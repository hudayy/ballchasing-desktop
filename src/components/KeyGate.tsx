import React, { useState } from "react";
import Spinner from "./Spinner";

export default function KeyGate({ onAuthed }: { onAuthed: () => void }) {
  const [step, setStep] = useState<"accounts" | "single" | "separate">("accounts");
  const [key, setKey] = useState("");
  const [manageKey, setManageKey] = useState("");
  const [uploadKey, setUploadKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submitSingle = async () => {
    setBusy(true); setErr(null);
    const res = await window.api.setKey(key.trim());
    setBusy(false);
    if (res.ok) onAuthed();
    else setErr(res.status === 401 ? "That API key was rejected (401)." : res.error || "Failed to validate key.");
  };

  const submitSeparate = async () => {
    setBusy(true); setErr(null);
    const m = await window.api.setKey(manageKey.trim());
    if (!m.ok) { setBusy(false); setErr("Managing key: " + (m.status === 401 ? "rejected (401)." : m.error || "failed")); return; }
    const u = await window.api.setUploaderKey(uploadKey.trim());
    setBusy(false);
    if (u.ok) onAuthed();
    else setErr("Uploading key: " + (u.status === 401 ? "rejected (401)." : u.error || "failed"));
  };

  return (
    <div className="gate">
      <h1>Ballchasing Desktop</h1>

      {step === "accounts" && (
        <>
          <p>
            Sign in with your <b>ballchasing.com API key</b> — no Steam login required. The key is
            stored encrypted on this device and never leaves the app's main process.
          </p>
          <p style={{ marginTop: 14 }}>Do you use <b>separate accounts</b> for uploading and managing your replays?</p>
          <div className="row" style={{ gap: 8 }}>
            <button className="primary" onClick={() => setStep("single")}>No, one account</button>
            <button onClick={() => setStep("separate")}>Yes, separate accounts</button>
          </div>
        </>
      )}

      {step === "single" && (
        <>
          <p>Enter your <b>ballchasing API key</b>.</p>
          <div className="row">
            <input type="password" placeholder="Paste API key…" value={key} autoFocus
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && key.trim() && submitSingle()} />
            <button className="primary" disabled={!key.trim() || busy} onClick={submitSingle}>{busy ? <Spinner small /> : "Continue"}</button>
          </div>
          <p style={{ marginTop: 8 }}><a href="#" onClick={(e) => { e.preventDefault(); setStep("accounts"); }}>← back</a></p>
        </>
      )}

      {step === "separate" && (
        <>
          <p>
            Enter both keys. The <b>managing key</b> is your own account — its groups, replays and
            stats are what the app shows and uses for every request. The <b>uploading key</b> is used
            only to upload replays and to filter to replays uploaded by that account.
          </p>
          <label className="field">Managing API key
            <input type="password" placeholder="Your account's API key" value={manageKey} autoFocus
              onChange={(e) => setManageKey(e.target.value)} />
          </label>
          <label className="field">Uploading API key
            <input type="password" placeholder="The uploading account's API key" value={uploadKey}
              onChange={(e) => setUploadKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && manageKey.trim() && uploadKey.trim() && submitSeparate()} />
          </label>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" disabled={!manageKey.trim() || !uploadKey.trim() || busy} onClick={submitSeparate}>
              {busy ? <Spinner small /> : "Continue"}
            </button>
            <button onClick={() => setStep("accounts")} disabled={busy}>← back</button>
          </div>
        </>
      )}

      {err ? <div className="err">{err}</div> : null}
      {step !== "separate" && (
        <p style={{ marginTop: 18, fontSize: 11 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); window.api.openExternal("https://ballchasing.com/upload"); }}>
            Open ballchasing.com to get a key →
          </a>
        </p>
      )}
    </div>
  );
}
