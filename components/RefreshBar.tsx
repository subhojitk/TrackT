"use client";

import { useEffect, useState } from "react";

interface Props {
  lastUpdated: Date | null;
  onRefresh: () => void;
  intervalSeconds?: number;
}

export default function RefreshBar({ lastUpdated, onRefresh, intervalSeconds = 30 }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(intervalSeconds);

  useEffect(() => {
    setSecondsLeft(intervalSeconds);
  }, [lastUpdated, intervalSeconds]);

  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          return intervalSeconds;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [intervalSeconds]);

  const pct = ((intervalSeconds - secondsLeft) / intervalSeconds) * 100;

  return (
    <div className="flex items-center gap-3 text-xs text-zinc-500">
      <div className="flex-1 h-0.5 bg-zinc-800 rounded overflow-hidden">
        <div
          className="h-full bg-green-700 transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>
        {lastUpdated
          ? `Updated ${lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
          : "Loading…"}
      </span>
      <button
        onClick={onRefresh}
        className="text-zinc-400 hover:text-zinc-100 transition-colors"
        title="Refresh now"
      >
        ↻
      </button>
    </div>
  );
}
