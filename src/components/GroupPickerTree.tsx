import React, { useCallback, useEffect, useState } from "react";
import { getFavorites, getTopParentName, registerKnownGroups } from "../lib/store";
import Spinner from "./Spinner";

interface Group { id: string; name: string; direct_replays?: number; indirect_replays?: number; }
interface NodeState { children?: Group[]; loading?: boolean; expanded?: boolean; loaded?: boolean; }
const ROOT = "__root__";

// A compact, selection-only group tree that reuses the same cached API layer.
// Used inside the "Add to group" dialog so placing a new group inside another
// is as fast and contextual as the main sidebar.
export default function GroupPickerTree({
  selectedId,
  onSelect
}: {
  selectedId: string | null;
  onSelect: (g: { id: string; name: string }) => void;
}) {
  const [nodes, setNodes] = useState<Record<string, NodeState>>({});
  const favorites = getFavorites();

  const setNode = (id: string, patch: Partial<NodeState>) =>
    setNodes((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const load = useCallback(async (id: string) => {
    setNode(id, { loading: true });
    const params: any = { creator: "me", count: 200, "sort-by": "name", "sort-dir": "asc" };
    if (id !== ROOT) params.group = id;
    const res = await window.api.listGroups(params);
    const list: Group[] = (res.ok && res.data && res.data.list) || [];
    registerKnownGroups(list.map((g) => ({ id: g.id, name: g.name })), id === ROOT ? null : id);
    setNode(id, { children: list, loading: false, loaded: true });
  }, []);

  useEffect(() => { load(ROOT); }, [load]);

  const toggle = async (g: Group) => {
    const st = nodes[g.id];
    if (st?.expanded) { setNode(g.id, { expanded: false }); return; }
    setNode(g.id, { expanded: true });
    if (!st?.loaded) await load(g.id);
  };

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
        </div>
        {st?.expanded && (st.loading && !st.children
          ? <div className="tree-row" style={{ paddingLeft: 6 + (depth + 1) * 14 }}><Spinner small /></div>
          : (st.children || []).map((c) => renderNode(c, depth + 1)))}
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
      <div className="picker-tree">
        {root?.loading && !root?.children ? <div className="pad"><Spinner small label="Loading…" /></div>
          : (root?.children || []).map((g) => renderNode(g, 0))}
      </div>
    </div>
  );
}
