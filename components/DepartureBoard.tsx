"use client";

import { useState, useRef, useEffect } from "react";
import { usePredictions } from "@/hooks/usePredictions";
import { useAlerts } from "@/hooks/useAlerts";
import { useHistoricalContext } from "@/hooks/useHistoricalContext";
import PredictionRow from "./PredictionRow";
import AlertBanner from "./AlertBanner";
import ReliabilityGauge from "./ReliabilityGauge";
import DirectionToggle from "./DirectionToggle";
import RefreshBar from "./RefreshBar";

interface Props {
  stopId: string;
  stopName: string;
}

function SkeletonRows() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <tr key={i} className="border-b border-zinc-800 animate-pulse">
          <td className="py-3 pr-2"><div className="w-6 h-6 rounded bg-zinc-700" /></td>
          <td className="py-3 pr-4"><div className="h-4 bg-zinc-700 rounded w-32" /></td>
          <td className="py-3"><div className="h-4 bg-zinc-700 rounded w-12 mx-auto" /></td>
          <td className="py-3"><div className="h-4 bg-zinc-700 rounded w-16 mx-auto" /></td>
          <td className="py-3"><div className="h-4 bg-zinc-700 rounded w-16 mx-auto" /></td>
          <td className="py-3"><div className="h-4 bg-zinc-700 rounded w-14 ml-auto" /></td>
        </tr>
      ))}
    </>
  );
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DepartureBoard({ stopId, stopName }: Props) {
  const [direction, setDirection] = useState<"all" | "0" | "1">("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const prevDataRef = useRef<string>("");

  const { predictions, isLoading, isError, errorMessage, refresh } = usePredictions(stopId);
  const { alerts } = useAlerts(stopId);
  const historical = useHistoricalContext(stopId, direction);

  useEffect(() => {
    const key = JSON.stringify(predictions);
    if (key !== prevDataRef.current) {
      prevDataRef.current = key;
      setLastUpdated(new Date());
    }
  }, [predictions]);

  const now = new Date();
  const displayed = predictions
    .filter(p => direction === "all" || p.directionId === parseInt(direction))
    .filter(p => p.predicted && new Date(p.predicted).getTime() > now.getTime() - 90_000)
    .slice(0, 9);

  const scored = predictions.filter(
    p => p.delay !== null && p.scheduleRelationship !== "CANCELLED"
  );
  const onTimeNow =
    scored.length > 0
      ? Math.round(
          (scored.filter(p => (p.delay ?? 99) <= 1).length / scored.length) * 100
        )
      : null;

  return (
    <div className="space-y-4">
      {alerts.map(a => (
        <AlertBanner key={a.id} alert={a} />
      ))}

      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">{stopName}</h1>
          <p className="text-xs text-zinc-500 mt-1">Green Line · MBTA</p>
        </div>
        <ReliabilityGauge live={onTimeNow} historical={historical} />
      </div>

      {historical && (
        <p className="text-sm text-zinc-400 bg-zinc-800/50 rounded px-3 py-2">
          Historically, trains here run{" "}
          <span className="font-mono font-semibold text-zinc-100">
            {historical.avgDelayMinutes > 0
              ? `+${historical.avgDelayMinutes} min late`
              : "on time"}
          </span>{" "}
          at this hour on {DAY_NAMES[new Date().getDay()]}s.{" "}
          75th percentile:{" "}
          <span className="font-mono font-semibold text-zinc-100">
            +{historical.p75DelayMinutes} min
          </span>
          {historical.sampleSize > 0 && (
            <span className="text-zinc-600"> ({historical.sampleSize.toLocaleString()} trips)</span>
          )}
        </p>
      )}

      <div className="flex items-center justify-between">
        <DirectionToggle value={direction} onChange={setDirection} />
        {isError && (
          <span className="text-xs text-red-400">Error: {errorMessage}</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px]">
          <thead>
            <tr className="text-xs uppercase tracking-widest text-zinc-500 border-b border-zinc-700">
              <th className="pb-2 text-left w-8" />
              <th className="pb-2 text-left">Destination</th>
              <th className="pb-2 text-center w-20">In</th>
              <th className="pb-2 text-center w-24">Scheduled</th>
              <th className="pb-2 text-center w-24">Predicted</th>
              <th className="pb-2 text-right w-28">Honest</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && !predictions.length && <SkeletonRows />}
            {displayed.map((p, i) => (
              <PredictionRow key={p.id} prediction={p} index={i} />
            ))}
            {!isLoading && !displayed.length && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-zinc-500 text-sm">
                  No upcoming trains for this stop and direction.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <RefreshBar
        lastUpdated={lastUpdated}
        onRefresh={() => refresh()}
        intervalSeconds={30}
      />
    </div>
  );
}
