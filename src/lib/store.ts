// Tiny localStorage-backed store for favorites + a registry of known groups
// (so the "add to group" picker can show real names without extra API calls).

export interface KnownGroup { id: string; name: string; parentId?: string | null; }

const FAV_KEY = "bc.favorites";
const KNOWN_KEY = "bc.knownGroups";

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// --- favorites (set of group ids, with cached names) ---
export function getFavorites(): KnownGroup[] {
  return read<KnownGroup[]>(FAV_KEY, []);
}
export function isFavorite(id: string): boolean {
  return getFavorites().some((g) => g.id === id);
}
export function toggleFavorite(g: KnownGroup): boolean {
  const favs = getFavorites();
  const idx = favs.findIndex((f) => f.id === g.id);
  if (idx >= 0) { favs.splice(idx, 1); write(FAV_KEY, favs); return false; }
  favs.push({ id: g.id, name: g.name }); write(FAV_KEY, favs); return true;
}

// --- known groups registry (populated as the tree loads) ---
export function registerKnownGroups(groups: KnownGroup[], parentId: string | null = null) {
  const map = new Map(read<KnownGroup[]>(KNOWN_KEY, []).map((g) => [g.id, g] as const));
  for (const g of groups) if (g.id) map.set(g.id, { id: g.id, name: g.name, parentId });
  write(KNOWN_KEY, Array.from(map.values()));
}
export function getKnownGroups(): KnownGroup[] {
  return read<KnownGroup[]>(KNOWN_KEY, []).sort((a, b) => a.name.localeCompare(b.name));
}

// Walk up the cached parent chain to the top-level ancestor's name (for context).
export function getTopParentName(id: string): string | null {
  const all = new Map(read<KnownGroup[]>(KNOWN_KEY, []).map((g) => [g.id, g] as const));
  let cur = all.get(id);
  if (!cur) return null;
  const seen = new Set<string>();
  while (cur && cur.parentId && all.has(cur.parentId) && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = all.get(cur.parentId);
  }
  return cur && cur.id !== id ? cur.name : null;
}

// --- linked groups (pasted via link, not owned by the user) ---
const LINKED_KEY = "bc.linkedGroups";
export function getLinkedGroups(): KnownGroup[] {
  return read<KnownGroup[]>(LINKED_KEY, []);
}
export function addLinkedGroup(g: KnownGroup) {
  const list = read<KnownGroup[]>(LINKED_KEY, []);
  const idx = list.findIndex((x) => x.id === g.id);
  if (idx >= 0) list[idx] = { id: g.id, name: g.name }; else list.unshift({ id: g.id, name: g.name });
  write(LINKED_KEY, list);
}
export function removeLinkedGroup(id: string) {
  write(LINKED_KEY, read<KnownGroup[]>(LINKED_KEY, []).filter((g) => g.id !== id));
}
export function isLinkedGroup(id: string): boolean {
  return read<KnownGroup[]>(LINKED_KEY, []).some((g) => g.id === id);
}

// simple pub/sub so favorite stars update across components
const listeners = new Set<() => void>();
export function onStoreChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function emitStoreChange() { listeners.forEach((l) => l()); }
