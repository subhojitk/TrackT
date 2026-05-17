"use client";

import type { Prediction } from "@/types/mbta";
import { formatTime, minutesUntil, delayLabel, countdown, branchBadgeColor } from "@/lib/utils";

interface Props {
  prediction: Prediction;
  index: number;
}

export default function PredictionRow({ prediction: p, index }: Props) {
  const mins = minutesUntil(p.predicted);
  const { text: delayText, cls: delayCls } = delayLabel(p.delay);
  const isCancelled = p.scheduleRelationship === "CANCELLED";

  return (
    <tr
      className={`border-b border-zinc-800 transition-colors ${
        index === 0 ? "bg-zinc-800/30" : "hover:bg-zinc-800/20"
      } ${isCancelled ? "opacity-40 line-through" : ""}`}
    >
      <td className="py-3 pr-2">
        <span
          className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${branchBadgeColor(p.branch)}`}
        >
          {p.branch}
        </span>
      </td>
      <td className="py-3 pr-4 font-medium text-zinc-100 max-w-[10rem] truncate">
        {p.headsign}
        {p.status && (
          <span className="ml-2 text-xs text-zinc-500">{p.status}</span>
        )}
      </td>
      <td className="py-3 text-center font-mono">
        <span
          className={`text-sm font-semibold ${
            mins !== null && mins <= 2 ? "text-amber-400" : "text-zinc-100"
          }`}
        >
          {countdown(mins)}
        </span>
      </td>
      <td className="py-3 text-center font-mono text-zinc-500 text-sm">
        {formatTime(p.scheduled)}
      </td>
      <td className="py-3 text-center font-mono text-zinc-200 text-sm">
        {formatTime(p.predicted)}
      </td>
      <td className={`py-3 text-right font-mono text-sm font-semibold ${delayCls}`}>
        {isCancelled ? "CANCELLED" : delayText}
      </td>
    </tr>
  );
}
