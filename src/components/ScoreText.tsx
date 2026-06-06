import React from "react";

// Renders a string, wrapping the first "N-M" score token in a boxed chip with
// the winning side bold/bright so series & group scores stand out from text.
export function ScoreText({ text }: { text: string }) {
  const m = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m || m.index == null) return <>{text}</>;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length);
  return (
    <>
      {before}
      <span className="score-chip">
        <span className={a > b ? "sc-win" : "sc-lose"}>{m[1]}</span>
        <span className="sc-dash">–</span>
        <span className={b > a ? "sc-win" : "sc-lose"}>{m[2]}</span>
      </span>
      {after}
    </>
  );
}

// A boxed +N / -N game differential, green when positive, red when negative.
export function DiffChip({ diff }: { diff: number }) {
  const cls = diff > 0 ? "win" : diff < 0 ? "loss" : "neutral";
  const txt = diff > 0 ? `+${diff}` : String(diff);
  return <span className={"diff-chip " + cls} title="session game differential">{txt}</span>;
}
