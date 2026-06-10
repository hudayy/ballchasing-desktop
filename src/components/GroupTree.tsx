import React, { useCallback, useEffect, useRef, useState } from "react";
import { isFavorite, toggleFavorite, registerKnownGroups, emitStoreChange, onStoreChange, getLinkedGroups, removeLinkedGroup } from "../lib/store";
import { cellColor, columnStats } from "../lib/heat";
import { ScoreText } from "./ScoreText";
import { toast } from "../lib/toast";

// Total replays in a group's subtree (indirect already includes direct on ballchasing).
const groupTotal = (g: { direct_replays?: number; indirect_replays?: number }) =>
  g.indirect_replays || g.direct_replays || 0;

interface Group {
  id: string;
  name: string;
  direct_replays?: number;
  indirect_replays?: number;
}
interface NodeState { children?: Group[]; loading?: boolean; expanded?: boolean; loaded?: boolean; }

const ROOT = "__root__";

export default function GroupTree({
  selectedId,
  onSelect,
  refreshSignal
}: {
  selectedId: string | null;
  onSelect: (g: Group | null) => void;
  refreshSignal: number;
}) {
  const [nodes, setNodes] = useState<Record<string, NodeState>>({});
  const [multiSel, setMultiSel] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [creatingParent, setCreatingParent] = useState<string | null>(null); // inline new-subgroup row
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null); // inline rename
  const [renameVal, setRenameVal] = useState("");
  const [, forceRender] = useState(0);
  const groupById = useRef<Record<string, Group>>({});
  const dragging = useRef<string[]>([]);
  // ids of nodes that belong to a LINKED (not-owned) subtree — fetched without creator=me
  const externalIds = useRef<Set<string>>(new Set());

  // re-render on favorite / linked-group changes
  useEffect(() => onStoreChange(() => forceRender((n) => n + 1)), []);

  const setNode = (id: string, patch: Partial<NodeState>) =>
    setNodes((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  // `external` => a group the user doesn't own; list children without creator=me.
  const loadChildren = useCallback(async (id: string, force = false, external = false) => {
    setNode(id, { loading: true });
    const params: any = { count: 200, "sort-by": "name", "sort-dir": "asc" };
    if (!external) params.creator = "me";
    if (id !== ROOT) params.group = id;
    const res = await window.api.listGroups(params, { force });
    const list: Group[] = (res.ok && res.data && res.data.list) || [];
    list.forEach((g) => {
      groupById.current[g.id] = g;
      if (external) externalIds.current.add(g.id);
    });
    registerKnownGroups(list.map((g) => ({ id: g.id, name: g.name })), id === ROOT ? null : id);
    emitStoreChange();
    setNode(id, { children: list, loading: false, loaded: true });
    // smart background prefetch of grandchildren
    for (const child of list) {
      if ((child.indirect_replays || 0) > 0) {
        const p: any = { count: 200, group: child.id, "sort-by": "name", "sort-dir": "asc" };
        if (!external) p.creator = "me";
        window.api.listGroups(p).catch(() => {});
      }
    }
    return list;
  }, []);

  useEffect(() => { groupById.current = {}; setNodes({}); externalIds.current = new Set(); loadChildren(ROOT, true); }, [refreshSignal, loadChildren]);

  const isExternal = (id: string) => externalIds.current.has(id);

  const toggle = async (g: Group) => {
    const st = nodes[g.id];
    if (st?.expanded) { setNode(g.id, { expanded: false }); return; }
    setNode(g.id, { expanded: true });
    if (!st?.loaded) await loadChildren(g.id, false, isExternal(g.id));
  };

  // Replay counts can't tell us whether a group has EMPTY subgroups, so every
  // group is expandable; an empty result shows a brief "(no subgroups)" row.
  const hasChildren = (_g: Group) => true;

  // flattened order of currently-visible nodes (for shift-range select)
  const visibleOrder = (): string[] => {
    const order: string[] = [];
    const walk = (list: Group[]) => {
      for (const g of list) {
        order.push(g.id);
        const st = nodes[g.id];
        if (st?.expanded && st.children) walk(st.children);
      }
    };
    walk(nodes[ROOT]?.children || []);
    return order;
  };
  const anchor = useRef<string | null>(null);

  // ---- selection: ctrl/cmd = toggle, shift = range, plain = open ----
  const rowClick = (g: Group, e: React.MouseEvent) => {
    if (e.shiftKey && anchor.current) {
      const order = visibleOrder();
      const a = order.indexOf(anchor.current), b = order.indexOf(g.id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setMultiSel((prev) => { const n = new Set(prev); for (let i = lo; i <= hi; i++) n.add(order[i]); return n; });
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setMultiSel((prev) => { const n = new Set(prev); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; });
      anchor.current = g.id;
    } else {
      setMultiSel(new Set([g.id]));
      anchor.current = g.id;
      onSelect(g);
    }
  };

  // ---- drag & drop re-parenting (multi) ----
  const onDragStart = (g: Group) => {
    dragging.current = multiSel.has(g.id) && multiSel.size > 1 ? Array.from(multiSel) : [g.id];
  };
  const onDrop = async (target: Group | null) => {
    const ids = dragging.current;
    dragging.current = [];
    setDropTarget(null);
    if (ids.length === 0) return;
    const targetId = target ? target.id : "";
    if (target && ids.includes(target.id)) return;
    let failed = 0;
    for (const id of ids) {
      const res = await window.api.patchGroup(id, { parent: targetId });
      if (!res.ok) failed++;
    }
    if (failed) toast(`${failed}/${ids.length} move(s) failed (ballchasing may not allow changing a group's parent).`, "error");
    setMultiSel(new Set());
    await loadChildren(ROOT, true);
    if (target && nodes[target.id]?.loaded) { setNode(target.id, { expanded: true }); await loadChildren(target.id, true); }
  };

  // ---- inline "new subgroup" creation ----
  const startCreate = async (parentId: string) => {
    setNewName("");
    setCreatingParent(parentId);
    if (parentId !== ROOT) {
      setNode(parentId, { expanded: true });
      if (!nodes[parentId]?.loaded) await loadChildren(parentId);
    }
  };
  const cancelCreate = () => { setCreatingParent(null); setNewName(""); };
  const commitCreate = async () => {
    const name = newName.trim();
    const parentId = creatingParent;
    if (!name || parentId == null) { cancelCreate(); return; }
    const body: any = { name, player_identification: "by-id", team_identification: "by-distinct-players" };
    if (parentId !== ROOT) body.parent = parentId;
    cancelCreate();
    const res = await window.api.createGroup(body);
    if (!res.ok) { toast("Create failed: " + res.error, "error"); return; }
    if (parentId !== ROOT) { setNode(parentId, { expanded: true }); await loadChildren(parentId, true); }
    else await loadChildren(ROOT, true);
  };

  const createRow = (parentId: string, depth: number) => (
    <div className="tree-row create-row" style={{ paddingLeft: 6 + depth * 15 }}>
      <span className="twisty" />
      <input
        className="create-input"
        autoFocus
        placeholder="New subgroup name… (Enter to create, Esc to cancel)"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commitCreate(); else if (e.key === "Escape") cancelCreate(); }}
        onBlur={() => { if (!newName.trim()) cancelCreate(); }}
      />
    </div>
  );

  // ---- inline rename (window.prompt is not supported in Electron) ----
  const startRename = (g: Group) => { setRenamingId(g.id); setRenameVal(g.name); };
  const cancelRename = () => setRenamingId(null);
  const commitRename = async () => {
    const id = renamingId;
    const name = renameVal.trim();
    setRenamingId(null);
    if (!id || !name) return;
    const g = groupById.current[id];
    if (!g || name === g.name) return;
    const res = await window.api.patchGroup(id, { name });
    if (!res.ok) { toast("Rename failed: " + res.error, "error"); return; }
    g.name = name; forceRender((n) => n + 1);
  };

  const deleteGroup = async (g: Group) => {
    if (!confirm(`Delete group "${g.name}"? This cannot be undone.`)) return;
    const res = await window.api.deleteGroup(g.id);
    if (!res.ok) { toast("Delete failed: " + res.error, "error"); return; }
    if (selectedId === g.id) onSelect(null);
    await loadChildren(ROOT, true);
  };

  // heat scale for the count pills, across all groups discovered so far
  const countStats = columnStats(Object.values(groupById.current).map(groupTotal));

  const unpinLinked = (g: Group) => {
    removeLinkedGroup(g.id);
    if (selectedId === g.id) onSelect(null);
    emitStoreChange();
  };

  const renderNode = (g: Group, depth: number): React.ReactNode => {
    const st = nodes[g.id];
    const external = isExternal(g.id);
    const linkedRoot = external && getLinkedGroups().some((x) => x.id === g.id);
    const expandable = hasChildren(g);
    const isDrop = dropTarget === g.id;
    const fav = isFavorite(g.id);
    const isSel = selectedId === g.id || multiSel.has(g.id);
    const total = groupTotal(g);
    const hasCount = g.direct_replays != null || g.indirect_replays != null;
    const pillBg = hasCount ? cellColor(total, countStats, false, true) : undefined;
    return (
      <div className="tree-node" key={g.id}>
        <div
          className={"tree-row" + (isSel ? " selected" : "") + (isDrop ? " drop-target" : "")}
          style={{ paddingLeft: 6 + depth * 15 }}
          onClick={(e) => rowClick(g, e)}
          draggable={!external}
          onDragStart={external ? undefined : (e) => { onDragStart(g); e.dataTransfer.effectAllowed = "move"; }}
          onDragOver={external ? undefined : (e) => { if (dragging.current.length) { e.preventDefault(); setDropTarget(g.id); } }}
          onDragLeave={external ? undefined : () => setDropTarget((t) => (t === g.id ? null : t))}
          onDrop={external ? undefined : (e) => { e.preventDefault(); e.stopPropagation(); onDrop(g); }}
        >
          <span className="twisty" onClick={(e) => { e.stopPropagation(); if (expandable) toggle(g); }}>
            {expandable ? (st?.expanded ? "▾" : "▸") : ""}
          </span>
          {renamingId === g.id ? (
            <input
              className="create-input"
              autoFocus
              value={renameVal}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setRenameVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); else if (e.key === "Escape") cancelRename(); }}
              onBlur={commitRename}
            />
          ) : (
            <span className="name" title={g.name}><ScoreText text={g.name} /></span>
          )}
          {hasCount ? (
            <span className="badge" title="replays (including subgroups)" style={pillBg ? { background: pillBg, color: "#e7eefb" } : undefined}>{total}</span>
          ) : null}
          <span
            className={"star" + (fav ? " on" : "")}
            title={fav ? "Unfavorite" : "Favorite"}
            onClick={(e) => { e.stopPropagation(); toggleFavorite({ id: g.id, name: g.name }); emitStoreChange(); }}
          >
            {fav ? "★" : "☆"}
          </span>
          <span className="rowactions">
            {external ? (
              linkedRoot ? <button title="Remove linked group" onClick={(e) => { e.stopPropagation(); unpinLinked(g); }}>✕</button> : null
            ) : (
              <>
                <button title="New subgroup" onClick={(e) => { e.stopPropagation(); startCreate(g.id); }}>＋</button>
                <button title="Rename" onClick={(e) => { e.stopPropagation(); startRename(g); }}>✎</button>
                <button title="Delete" onClick={(e) => { e.stopPropagation(); deleteGroup(g); }}>🗑</button>
              </>
            )}
          </span>
        </div>
        {st?.expanded ? (
          <div>
            {creatingParent === g.id ? createRow(g.id, depth + 1) : null}
            {st.loading && !st.children ? (
              <div className="tree-row" style={{ paddingLeft: 6 + (depth + 1) * 15 }}><span className="skeleton">loading…</span></div>
            ) : st.loaded && (st.children || []).length === 0 && creatingParent !== g.id ? (
              <div className="tree-row" style={{ paddingLeft: 6 + (depth + 1) * 15 }}><span className="muted" style={{ fontSize: 11 }}>(no subgroups)</span></div>
            ) : (
              (st.children || []).map((c) => renderNode(c, depth + 1))
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const root = nodes[ROOT];
  // linked (not-owned) groups pasted via a link; exclude any that are actually owned
  const ownedTop = new Set((root?.children || []).map((g) => g.id));
  const linkedRoots = getLinkedGroups().filter((g) => !ownedTop.has(g.id));
  linkedRoots.forEach((g) => externalIds.current.add(g.id));

  return (
    <>
      <div className="head">
        <b className="grow">Groups</b>
        {multiSel.size > 1 && <span className="muted" style={{ fontSize: 11 }}>{multiSel.size} sel</span>}
        <button title="New top-level group" onClick={() => startCreate(ROOT)}>＋ New</button>
        <button title="Refresh" onClick={() => loadChildren(ROOT, true)}>⟳</button>
      </div>
      <div
        className="tree"
        onDragOver={(e) => { if (dragging.current.length) e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); onDrop(null); }}
        title="Ctrl-click to multi-select. Drag groups onto another to re-parent; drop on empty space to move to top level."
      >
        {creatingParent === ROOT ? createRow(ROOT, 0) : null}
        {root?.loading && !root?.children ? (
          <div className="pad muted">Loading groups…</div>
        ) : (root?.children || []).length === 0 && creatingParent !== ROOT ? (
          <div className="pad muted">No groups yet. Create one with “＋ New”.</div>
        ) : (
          (root?.children || []).map((g) => renderNode(g, 0))
        )}

        {linkedRoots.length > 0 && (
          <>
            <div className="picker-section" title="Groups you opened from a link (not owned by you)">Linked groups</div>
            {linkedRoots.map((g) => renderNode(g as Group, 0))}
          </>
        )}
      </div>
    </>
  );
}
