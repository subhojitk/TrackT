"use client";

import type { Prediction } from "@/types/mbta";
import type { Line } from "@/lib/lines";
import { formatTime, minutesUntil, delayLabel, routeBadgeStyle, countdown } from "@/lib/utils";
import { Card, CardHeader, EmptyState, Pill, Skeleton } from "./ui";

interface Props {
  predictions: Prediction[];
  isLoading: boolean;
  direction: 0 | 1;
  fallbackLabel: string;
  line: Line;
  /** Current time (ms) from the parent's ticker, so countdowns re-render together. */
  now: number;
}

function BranchMark({ branch, line }: { branch: string; line: Line }) {
  // Only lines with several routes (Green B/C/D/E) need a per-row route badge
  if (line.routes.length > 1) {
    const style = routeBadgeStyle(branch);
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold shrink-0"
        style={{ backgroundColor: style.bg, color: style.text }}
      >
        {branch}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 shrink-0">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: line.color }} />
    </span>
  );
}

export default function DirectionBoard({ predictions, isLoading, direction, fallbackLabel, line, now }: Props) {
  const trains = predictions
    .filter(p => p.directionId === direction)
    .filter(p => p.predicted && new Date(p.predicted).getTime() > now - 60_000)
    .sort((a, b) => new Date(a.predicted!).getTime() - new Date(b.predicted!).getTime())
    .slice(0, 8);

  const headsigns = [...new Set(trains.filter(t => t.scheduleRelationship !== "CANCELLED").map(t => t.headsign))].slice(0, 2);
  const title = headsigns.length ? `To ${headsigns.join(" · ")}` : fallbackLabel;
  const subtitle = headsigns.length ? fallbackLabel : undefined;

  const [first, ...rest] = trains;
  const firstMins = first ? minutesUntil(first.predicted, now) : null;
  const firstDelay = first ? delayLabel(first.delay) : null;
  const firstCancelled = first?.scheduleRelationship === "CANCELLED";

  return (
    <Card className="flex flex-col min-h-[240px]">
      <CardHeader title={title} subtitle={subtitle} count={trains.length} />

      {isLoading && trains.length === 0 && (
        <div className="p-4 space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      )}

      {!isLoading && trains.length === 0 && (
        <EmptyState className="flex-1">No upcoming departures in this direction.</EmptyState>
      )}

      {first && (
        <>
          {/* Next departure */}
          <div className={`flex items-center justify-between gap-4 px-4 py-4 border-b border-line bg-surface-2/50 ${firstCancelled ? "opacity-60" : ""}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <BranchMark branch={first.branch} line={line} />
                <span className={`text-[16px] font-semibold text-fg truncate ${firstCancelled ? "line-through" : ""}`}>{first.headsign}</span>
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[12px] text-fg-3 pl-8">
                <span>Scheduled <span className="num text-fg-2">{formatTime(first.scheduled)}</span></span>
                {firstCancelled ? <Pill tone="bad">Cancelled</Pill> : firstDelay && <Pill tone={firstDelay.tone}>{firstDelay.text}</Pill>}
              </div>
            </div>
            <div className="text-right shrink-0">
              {firstMins !== null && firstMins <= 0 ? (
                <div className="num text-[34px] font-bold leading-none text-fg">Now</div>
              ) : (
                <>
                  <div className={`num text-[40px] font-bold leading-none ${firstMins !== null && firstMins <= 2 ? "text-orange-500" : "text-fg"}`}>{firstMins ?? "—"}</div>
                  <div className="text-[11px] font-medium text-fg-3 uppercase tracking-wider mt-1">min</div>
                </>
              )}
            </div>
          </div>

          {/* Following departures */}
          <ul className="divide-y divide-line" role="list">
            {rest.map(p => {
              const mins = minutesUntil(p.predicted, now);
              const delay = delayLabel(p.delay);
              const cancelled = p.scheduleRelationship === "CANCELLED";
              return (
                <li key={p.id} className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-2.5 ${cancelled ? "opacity-50" : ""}`}>
                  <BranchMark branch={p.branch} line={line} />
                  <div className="min-w-0">
                    <div className={`text-[13px] font-medium text-fg-2 truncate ${cancelled ? "line-through" : ""}`}>{p.headsign}</div>
                    <div className="text-[11px] text-fg-3 num">{formatTime(p.scheduled)}</div>
                  </div>
                  {cancelled ? <Pill tone="bad">Cancelled</Pill> : <Pill tone={delay.tone}>{delay.text}</Pill>}
                  <span className={`num text-[15px] font-semibold text-right min-w-[3.6rem] ${mins !== null && mins <= 2 ? "text-orange-500" : "text-fg"}`}>
                    {countdown(mins)}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
