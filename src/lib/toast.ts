// Tiny pub/sub toast system — replaces alert() popups, which block the event
// loop and steal window focus on Windows in Electron.

export interface Toast { id: number; msg: string; kind: "info" | "success" | "error"; }

const listeners = new Set<(t: Toast) => void>();
let nextId = 1;

export function toast(msg: string, kind: Toast["kind"] = "info") {
  const t: Toast = { id: nextId++, msg, kind };
  listeners.forEach((l) => l(t));
}

export function onToast(fn: (t: Toast) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
