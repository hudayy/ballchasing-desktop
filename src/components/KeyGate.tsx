import React, { useState } from "react";
import Spinner from "./Spinner";
import UploaderPicker from "./UploaderPicker";

export default function KeyGate({ onAuthed }: { onAuthed: (identity: any) => void }) {
  const [step, setStep] = useState<"key" | "role" | "uploader">("key");
  const [key, setKey] = useState("");
  const [identity, setIdentity] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submitKey = async () => {
    setBusy(true); setErr(null);
    const res = await window.api.setKey(key.trim());
    setBusy(false);
    if (res.ok) { setIdentity(res.identity); setStep("role"); }
    else setErr(res.status === 401 ? "That API key was rejected (401)." : res.error || "Failed to validate key.");
  };

  return (
    <div className="gate">
      <h1>Ballchasing Desktop</h1>

      {step === "key" && (
        <>
          <p>
            Sign in with your <b>ballchasing.com API key</b> — no Steam login required. Create or copy
            a key from your ballchasing account settings (Upload &amp; API section). The key is stored
            encrypted on this device and never leaves the app's main process.
          </p>
          <div className="row">
            <input type="password" placeholder="Paste API key…" value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && key.trim() && submitKey()} />
            <button className="primary" disabled={!key.trim() || busy} onClick={submitKey}>
              {busy ? <Spinner small /> : "Continue"}
            </button>
          </div>
        </>
      )}

      {step === "role" && (
        <>
          <p>
            Signed in as <b>{identity?.name || "you"}</b>. Are you the <b>primary uploader</b> of your
            replays? If a teammate or league bot uploads your games instead, choose “No” and provide
            their key so the app can find replays you appear in.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="primary" disabled={busy} onClick={() => onAuthed(identity)}>Yes, I upload my replays</button>
            <button disabled={busy} onClick={() => setStep("uploader")}>No, someone else uploads them</button>
          </div>
        </>
      )}

      {step === "uploader" && (
        <>
          <p>Who uploads <b>{identity?.name || "your"}</b>'s replays?</p>
          <UploaderPicker onDone={() => onAuthed(identity)} />
          <p style={{ marginTop: 8 }}><a href="#" onClick={(e) => { e.preventDefault(); setStep("role"); }}>← back</a></p>
        </>
      )}

      {err ? <div className="err">{err}</div> : null}
      {step === "key" && (
        <p style={{ marginTop: 18, fontSize: 11 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); window.api.openExternal("https://ballchasing.com/upload"); }}>
            Open ballchasing.com to get a key →
          </a>
        </p>
      )}
    </div>
  );
}
