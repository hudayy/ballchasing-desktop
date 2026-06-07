import React, { useState } from "react";
import { addLinkedGroup, emitStoreChange } from "../lib/store";

// Parse a ballchasing.com replay/group link (or a bare id) into { type, id }.
export function parseBcLink(input: string): { type: "replay" | "group"; id: string } | null {
  const s = (input || "").trim();
  if (!s) return null;
  const m = s.match(/ballchasing\.com\/(replay|group)\/([A-Za-z0-9\-_]+)/i);
  if (m) return { type: m[1].toLowerCase() as "replay" | "group", id: m[2] };
  return null;
}

// Sidebar input: paste a ballchasing link (or hit Paste to read the clipboard)
// to jump straight to that replay or group.
export default function LinkOpener({
  onOpenReplay,
  onOpenGroup
}: {
  onOpenReplay: (id: string) => void;
  onOpenGroup: (g: { id: string; name: string }) => void;
}) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState(false);

  const go = async (text?: string) => {
    const parsed = parseBcLink(text ?? value);
    if (!parsed) { setErr(true); return; }
    setErr(false);
    setValue("");
    if (parsed.type === "replay") onOpenReplay(parsed.id);
    else {
      // resolve the group name for a nicer header; fall back to the id
      let name = parsed.id;
      try { const r = await window.api.getGroup(parsed.id); if (r.ok && r.data?.name) name = r.data.name; } catch {}
      // pin it into the tree's "Linked groups" section so it's browsable
      addLinkedGroup({ id: parsed.id, name });
      emitStoreChange();
      onOpenGroup({ id: parsed.id, name });
    }
  };

  const paste = async () => {
    const text = await window.api.readClipboard();
    setValue(text);
    go(text);
  };

  return (
    <div className="linkopener">
      <input
        placeholder="Paste a ballchasing link…"
        value={value}
        onChange={(e) => { setValue(e.target.value); setErr(false); }}
        onKeyDown={(e) => e.key === "Enter" && go()}
        className={err ? "bad" : ""}
        title="Paste a ballchasing.com replay or group link"
      />
      <button title="Paste from clipboard" onClick={paste}>📋</button>
      <button title="Open" onClick={() => go()}>Go</button>
    </div>
  );
}
