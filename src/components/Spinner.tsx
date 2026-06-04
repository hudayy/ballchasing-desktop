import React from "react";

export default function Spinner({ label, small }: { label?: string; small?: boolean }) {
  return (
    <span className="spinner-wrap">
      <span className={"spinner" + (small ? " small" : "")} />
      {label ? <span className="muted" style={{ marginLeft: 8 }}>{label}</span> : null}
    </span>
  );
}
