"use client";

import type { Prediction } from "@/types/mbta";
import { formatTime, minutesUntil, delayLabel, routeBadgeStyle } from "@/lib/utils";

interface Props {
  predictions: Prediction[];
  isLoading: boolean;
  direction: 0 | 1;
  label: string;
}

export default function DirectionPanel({ predictions, isLoading, direction, label }: Props) {

  const now = new Date();
  const trains = predictions
    .filter(p => p.directionId === direction)
    .filter(p => p.predicted && new Date(p.predicted).getTime() > now.getTime() - 60_000)
    .slice(0, 8);

  return (
    <div className="flex-1 border-r border-zinc-800 last:border-r-0 flex flex-col min-w-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/60">
        <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400">{label}</span>
        <span className="text-[10px] text-zinc-600">{trains.length} TRAINS</span>
      </div>

      <div className="grid grid-cols-[1.25rem_1fr_2.5rem_3.5rem_3rem] gap-x-2 px-3 py-1 text-[9px] tracking-[0.15em] text-zinc-600 border-b border-zinc-800/60 uppercase">
        <span />
        <span>Dest</span>
        <span className="text-center">In</span>
        <span className="text-center">Sched</span>
        <span className="text-right">Delay</span>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40">
        {isLoading && !trains.length && (
          <div className="flex items-center justify-center h-16 text-[11px] text-zinc-600 tracking-widest">
            LOADING…
          </div>
        )}
        {trains.map((p, i) => {
          const mins = minutesUntil(p.predicted);
          const { text: delayText, cls: delayCls } = delayLabel(p.delay);
          const isCancelled = p.scheduleRelationship === "CANCELLED";
          return (
            <div
              key={p.id}
              className={`grid grid-cols-[1.25rem_1fr_2.5rem_3.5rem_3rem] gap-x-2 px-3 py-2 text-xs ${i === 0 ? "bg-zinc-800/30" : ""} ${isCancelled ? "opacity-40" : ""}`}
            >
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-sm text-[10px] font-bold"
                style={{ backgroundColor: routeBadgeStyle(p.branch).bg, color: routeBadgeStyle(p.branch).text }}
              >
                {p.branch}
              </span>
              <span className="truncate text-zinc-200 font-medium">{p.headsign}</span>
              <span className={`text-center font-bold tabular-nums ${mins !== null && mins <= 2 ? "text-amber-400" : "text-zinc-100"}`}>
                {mins !== null && mins <= 0 ? "NOW" : mins !== null ? `${mins}m` : "—"}
              </span>
              <span className="text-center text-zinc-500 tabular-nums text-[11px]">{formatTime(p.scheduled)}</span>
              <span className={`text-right font-bold tabular-nums text-[11px] ${isCancelled ? "text-red-400" : delayCls}`}>
                {isCancelled ? "CXLD" : delayText}
              </span>
            </div>
          );
        })}
        {!isLoading && !trains.length && (
          <div className="flex items-center justify-center h-16 text-[11px] text-zinc-600 tracking-widest">
            NO SERVICE
          </div>
        )}
      </div>
    </div>
  );
}
