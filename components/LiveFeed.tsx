"use client";

import { useEffect, useRef, useState } from "react";
import { usePredictions } from "@/hooks/usePredictions";

interface FeedEntry {
  id: string;
  time: string;
  message: string;
  type: "delay" | "improve" | "cancel" | "new" | "gone";
}

const TYPE_CLS: Record<string, string> = {
  delay:   "text-red-400",
  improve: "text-green-400",
  cancel:  "text-red-500",
  new:     "text-zinc-400",
  gone:    "text-zinc-500",
};

export default function LiveFeed({ stopId }: { stopId: string }) {
  const { predictions } = usePredictions(stopId);
  const prevRef = useRef<Map<string, { delay: number | null; rel: string | null }>>(new Map());
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    if (!predictions.length) return;
    const now = new Date().toLocaleTimeString("en-US", { hour12: false });
    const entries: FeedEntry[] = [];
    const prev = prevRef.current;

    if (!initialized.current) {
      initialized.current = true;
      const newMap = new Map<string, { delay: number | null; rel: string | null }>();
      for (const p of predictions) newMap.set(p.id, { delay: p.delay, rel: p.scheduleRelationship });
      prevRef.current = newMap;
      return;
    }

    const currentIds = new Set(predictions.map(p => p.id));

    // Departed / left the board
    for (const [id, old] of prev.entries()) {
      if (!currentIds.has(id) && old.rel !== "CANCELLED") {
        entries.push({ id: `${id}-gone-${Date.now()}`, time: now, message: `train departed`, type: "gone" });
      }
    }

    for (const p of predictions) {
      const old = prev.get(p.id);

      // New prediction appeared
      if (!old) {
        entries.push({
          id: `${p.id}-new-${Date.now()}`,
          time: now,
          message: `${p.branch} ${p.headsign} — added to board`,
          type: "new",
        });
        continue;
      }

      // Cancelled
      if (p.scheduleRelationship === "CANCELLED" && old.rel !== "CANCELLED") {
        entries.push({ id: `${p.id}-cancel`, time: now, message: `${p.branch} ${p.headsign} CANCELLED`, type: "cancel" });
        continue;
      }

      // Delay change
      if (p.delay !== null && old.delay !== null && p.delay !== old.delay) {
        const delta = p.delay - old.delay;
        if (delta > 0) {
          entries.push({ id: `${p.id}-d-${Date.now()}`, time: now, message: `${p.branch} ${p.headsign} +${delta}m worse → now +${p.delay}m`, type: "delay" });
        } else {
          entries.push({ id: `${p.id}-i-${Date.now()}`, time: now, message: `${p.branch} ${p.headsign} ${delta}m better → now ${p.delay > 0 ? `+${p.delay}m` : "on time"}`, type: "improve" });
        }
      }
    }

    const newMap = new Map<string, { delay: number | null; rel: string | null }>();
    for (const p of predictions) newMap.set(p.id, { delay: p.delay, rel: p.scheduleRelationship });
    prevRef.current = newMap;

    if (entries.length > 0) {
      setFeed(f => [...entries, ...f].slice(0, 60));
    }
  }, [predictions]);

  return (
    <div className="flex flex-col h-full min-w-0 flex-1">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
        <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400">LIVE FEED</span>
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono">
        {feed.length === 0 && (
          <div className="flex items-center justify-center h-full text-[11px] text-zinc-600 tracking-widest">
            MONITORING…
          </div>
        )}
        {feed.map(e => (
          <div key={e.id} className="flex gap-2 text-[11px] leading-snug">
            <span className="text-zinc-600 shrink-0 tabular-nums">{e.time}</span>
            <span className={TYPE_CLS[e.type] ?? "text-zinc-400"}>{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
