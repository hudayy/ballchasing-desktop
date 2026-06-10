import React from "react";

// Renders a string, wrapping the first "N-M" score token in a boxed chip with
// the winning side bold/bright so series & group scores stand out from text.
export function ScoreText({ text }: { text: string }) {
  // scores are 1–2 digits; skip anything that's part of an ISO date (2026-06-08)
  const dates: Array<[number, number]> = [];
  for (const dm of text.matchAll(/\d{4}-\d{2}-\d{2}/g)) dates.push([dm.index!, dm.index! + dm[0].length]);
  let m: RegExpMatchArray | null = null;
  for (const cand of text.matchAll(/(?<!\d)(\d{1,2})\s*[-–]\s*(\d{1,2})(?!\d)/g)) {
    const s = cand.index!, e = s + cand[0].length;
    if (!dates.some(([a, b]) => s < b && e > a)) { m = cand; break; }
  }
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
