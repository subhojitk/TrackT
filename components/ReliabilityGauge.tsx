"use client";

import type { HistoricalBaseline } from "@/types/mbta";

interface Props {
  live: number | null;
  historical: HistoricalBaseline | null;
}

function gaugeColor(pct: number) {
  if (pct >= 80) return "text-green-400";
  if (pct >= 60) return "text-yellow-400";
  return "text-red-400";
}

export default function ReliabilityGauge({ live, historical }: Props) {
  return (
    <div className="flex gap-4 text-right">
      {live !== null && (
        <div>
          <div className={`text-2xl font-mono font-bold ${gaugeColor(live)}`}>
            {live}%
          </div>
          <div className="text-xs text-zinc-500">on time now</div>
        </div>
      )}
      {historical && (
        <div>
          <div className="text-2xl font-mono font-bold text-zinc-400">
            {historical.avgDelayMinutes > 0 ? `+${historical.avgDelayMinutes}m` : "0m"}
          </div>
          <div className="text-xs text-zinc-500">avg delay (hist.)</div>
        </div>
      )}
    </div>
  );
}
