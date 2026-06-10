import React, { useEffect, useState } from "react";
import { onToast, Toast } from "../lib/toast";

// Bottom-right toast stack. Click a toast to dismiss it early.
export default function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => onToast((t) => {
    setItems((prev) => [...prev, t]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 5000);
  }), []);

  if (items.length === 0) return null;
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={"toast " + t.kind} onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
