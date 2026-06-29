import React, { useCallback, useEffect, useState } from "react";
import { getFavorites, getTopParentName, registerKnownGroups, getExpandedGroups, emitStoreChange } from "../lib/store";
import { toast } from "../lib/toast";
import Spinner from "./Spinner";

interface Group { id: string; name: string; direct_replays?: number; indirect_replays?: number; }
interface NodeState { children?: Group[]; loading?: boolean; expanded?: boolean; loaded?: boolean; }
const ROOT = "__root__";

// A compact, selection-only group tree that reuses the same cached API layer.
// Used inside the "Add to group" dialog so placing a new group inside another
// is as fast and contextual as the main sidebar. It opens with the same
// branches expanded as the sidebar tree, and lets you spin up a new empty group
// on the fly to use as a parent or target.
export default function GroupPickerTree({
  selectedId,
  onSelect
}: {
  selectedId: string | null;
  onSelect: (g: { id: string; name: string }) => void;
}) {
  const [nodes, setNodes] = useState<Record<string, NodeState>>({});
  const [creatingParent, setCreatingParent] = useState<string | null>(null); // inline new-group row
  const [newName, setNewName] = useState("");
  const favorites = getFavorites();

  const setNode = (id: string, patch: Partial<NodeState>) =>
    setNodes((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const load = useCallback(async (id: string): Promise<Group[]> => {
    setNode(id, { loading: true });
    const params: any = { creator: "me", count: 200, "sort-by": "name", "sort-dir": "asc" };
    if (id !== ROOT) params.group = id;
    const res = await window.api.listGroups(params);
    const list: Group[] = (res.ok && res.data && res.data.list) || [];
    registerKnownGroups(list.map((g) => ({ id: g.id, name: g.name })), id === ROOT ? null : id);
    setNode(id, { children: list, loading: false, loaded: true });
    return list;
  }, []);

  // Re-expand the branches the user has open in the sidebar tree.
  const restore = useCallback(async (list: Group[], want: Set<string>) => {
    for (const g of list) {
      if (want.has(g.id)) {
        setNode(g.id, { expanded: true });
        const kids = await load(g.id);
        await restore(kids, want);
      }
    }
  }, [load]);

  useEffect(() => {
    (async () => {
      const list = await load(ROOT);
      const want = new Set(getExpandedGroups());
      if (want.size) await restore(list, want);
    })();
  }, [load, restore]);

  const toggle = async (g: Group) => {
    const st = nodes[g.id];
    if (st?.expanded) { setNode(g.id, { expanded: false }); return; }
    setNode(g.id, { expanded: true });
    if (!st?.loaded) await load(g.id);
  };

  // ---- inline "new empty group" creation ----
  const startCreate = async (parentId: string) => {
    setNewName("");
    setCreatingParent(parentId);
    if (parentId !== ROOT) {
      setNode(parentId, { expanded: true });
      if (!nodes[parentId]?.loaded) await load(parentId);
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
    const created = { id: res.data.id, name };
    registerKnownGroups([created], parentId === ROOT ? null : parentId);
    emitStoreChange();
    window.dispatchEvent(new Event("bc:groups-changed")); // refresh the sidebar tree
    if (parentId !== ROOT) { setNode(parentId, { expanded: true }); await load(parentId); }
    else await load(ROOT);
    onSelect(created); // make the new empty group the chosen parent / target
  };

  const createRow = (depth: number) => (
    <div className="tree-row create-row" style={{ paddingLeft: 6 + depth * 14 }}>
      <span className="twisty" />
      <input
        className="create-input"
        autoFocus
        placeholder="New group name… (Enter to create, Esc to cancel)"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Enter") commitCreate(); else if (e.key === "Escape") cancelCreate(); }}
        onBlur={() => { if (!newName.trim()) cancelCreate(); }}
      />
    </div>
  );

  const renderNode = (g: Group, depth: number): React.ReactNode => {
    const st = nodes[g.id];
    // replay counts can't reveal empty subgroups, so every group is expandable
    const expandable = true;
    return (
      <div key={g.id}>
        <div className={"tree-row" + (selectedId === g.id ? " selected" : "")} style={{ paddingLeft: 6 + depth * 14 }}
          onClick={() => onSelect({ id: g.id, name: g.name })}>
          <span className="twisty" onClick={(e) => { e.stopPropagation(); if (expandable) toggle(g); }}>
            {expandable ? (st?.expanded ? "▾" : "▸") : ""}
          </span>
          <span className="name" title={g.name}>{g.name}</span>
          <span className="rowactions">
            <button title="New subgroup here" onClick={(e) => { e.stopPropagation(); startCreate(g.id); }}>＋</button>
          </span>
        </div>
        {st?.expanded && (
          <div>
            {creatingParent === g.id ? createRow(depth + 1) : null}
            {st.loading && !st.children
              ? <div className="tree-row" style={{ paddingLeft: 6 + (depth + 1) * 14 }}><Spinner small /></div>
              : st.loaded && (st.children || []).length === 0 && creatingParent !== g.id
                ? <div className="tree-row" style={{ paddingLeft: 6 + (depth + 1) * 14 }}><span className="muted" style={{ fontSize: 11 }}>(no subgroups)</span></div>
                : (st.children || []).map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const root = nodes[ROOT];
  return (
    <div className="picker">
      {favorites.length > 0 && (
        <div className="picker-favs">
          <div className="picker-section">★ Favorites</div>
          {favorites.map((f) => {
            const ctx = getTopParentName(f.id);
            return (
              <div key={f.id} className={"tree-row" + (selectedId === f.id ? " selected" : "")} onClick={() => onSelect({ id: f.id, name: f.name })}>
                <span className="star on">★</span>
                <span className="name" title={f.name}>{f.name}</span>
                {ctx ? <span className="muted" style={{ fontSize: 10 }}>in {ctx}</span> : null}
              </div>
            );
          })}
          <div className="picker-section">All groups</div>
        </div>
      )}
      <div className="picker-newrow">
        <button onClick={() => startCreate(ROOT)}>＋ New empty group</button>
      </div>
      <div className="picker-tree">
        {creatingParent === ROOT ? createRow(0) : null}
        {root?.loading && !root?.children ? <div className="pad"><Spinner small label="Loading…" /></div>
          : (root?.children || []).map((g) => renderNode(g, 0))}
      </div>
    </div>
  );
}
