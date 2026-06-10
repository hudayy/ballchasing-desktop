import React, { useState } from "react";
import { addLinkedGroup, emitStoreChange } from "../lib/store";
import { toast } from "../lib/toast";

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
    if (parsed.type === "replay") { setValue(""); onOpenReplay(parsed.id); }
    else {
      // validate the group exists before pinning it into the tree
      const r = await window.api.getGroup(parsed.id).catch(() => ({ ok: false } as any));
      if (!r.ok) { toast("Couldn't open that group — the link may be wrong or the group private.", "error"); setErr(true); return; }
      const name = r.data?.name || parsed.id;
      setValue("");
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
