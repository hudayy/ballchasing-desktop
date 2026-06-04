import React, { useEffect, useState } from "react";

// Patron-tier colors matching ballchasing's own palette.
function tierClass(tier: string): string {
  const t = (tier || "").toLowerCase();
  if (t.includes("legend")) return "tier-legend";
  if (t.includes("grand") || t === "gc") return "tier-gc";
  if (t.includes("champion")) return "tier-champion";
  if (t.includes("diamond")) return "tier-diamond";
  if (t.includes("gold")) return "tier-gold";
  return "tier-free";
}
function tierLabel(tier: string): string {
  const t = (tier || "").toLowerCase();
  if (t.includes("legend")) return "Legend";
  if (t.includes("grand") || t === "gc") return "GC";
  if (t.includes("champion")) return "Champion";
  if (t.includes("diamond")) return "Diamond";
  if (t.includes("gold")) return "Gold";
  return "Free";
}

export default function RateMeter() {
  const [s, setS] = useState<{ tier: string; rps: number; queued: number; inFlight: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => { const st = await window.api.status(); if (alive) setS(st); };
    tick();
    const h = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(h); };
  }, []);

  if (!s) return null;
  return (
    <div className="ratemeter" title="Shared rate-limit-aware request scheduler">
      <span className="pill">tier <b className={tierClass(s.tier)}>{tierLabel(s.tier)}</b></span>
      <span className="pill">{s.rps}/s budget</span>
      <span className="pill">{s.inFlight} active · {s.queued} queued</span>
    </div>
  );
}
