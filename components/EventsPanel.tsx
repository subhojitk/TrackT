"use client";

import Link from "next/link";
import { useEvents } from "@/hooks/useEvents";
import { getStop } from "@/lib/stops";
import type { TransitEvent } from "@/types/mbta";
import { Users } from "./icons";
import { Card, CardHeader, EmptyState, Pill, Skeleton, type Tone } from "./ui";

const SPORT_LABEL: Record<TransitEvent["sport"], string> = {
  MLB: "Red Sox",
  NHL: "Bruins",
  NBA: "Celtics",
  EVENT: "Event",
};

const CROWD: Record<TransitEvent["crowdLevel"], { label: string; tone: Tone }> = {
  "medium":    { label: "Moderate crowds", tone: "info" },
  "high":      { label: "Busy", tone: "warn" },
  "very-high": { label: "Very busy", tone: "bad" },
};

function eventDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const dayLabel = sameDay(d, today) ? "Today" : sameDay(d, tomorrow) ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short" });
  return {
    dayLabel,
    dayNum: d.toLocaleDateString("en-US", { day: "numeric" }),
    month: d.toLocaleDateString("en-US", { month: "short" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

function EventRow({ event, activeStopId }: { event: TransitEvent; activeStopId?: string }) {
  const isActive = activeStopId ? event.affectedStops.some(s => s.stopId === activeStopId) : false;
  const { dayLabel, dayNum, month, time } = eventDate(event.startTime);
  const crowd = CROWD[event.crowdLevel];

  return (
    <li className={`flex gap-4 px-4 py-3 ${isActive ? "bg-amber-400/[0.04]" : ""}`}>
      <div className="w-11 shrink-0 text-center pt-0.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-3">{dayLabel === "Today" || dayLabel === "Tomorrow" ? month : dayLabel}</div>
        <div className="num text-[20px] font-bold leading-none text-fg mt-0.5">{dayNum}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-fg leading-snug">{event.name}</div>
            <div className="text-[12px] text-fg-3 mt-0.5 truncate">
              {dayLabel} · <span className="num">{time}</span> · {event.venue}
            </div>
          </div>
          <Pill tone={crowd.tone} className="shrink-0 mt-0.5">{crowd.label}</Pill>
        </div>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="text-[11px] text-fg-3 mr-0.5">{SPORT_LABEL[event.sport]} · Expect crowds at</span>
          {event.affectedStops.map(({ stopId, lineId }) => {
            const label = getStop(stopId)?.name ?? stopId;
            const active = stopId === activeStopId;
            return (
              <Link
                key={stopId}
                href={`/stop/${lineId}/${stopId}`}
                className={`text-[11px] font-medium px-1.5 py-0.5 rounded-md transition-colors focus-ring ${
                  active ? "bg-amber-400/15 text-amber-200" : "bg-white/6 hover:bg-white/10 text-fg-2"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </li>
  );
}

export default function EventsPanel({ stopId }: { stopId?: string }) {
  const { events, isLoading } = useEvents();
  const sorted = [...events].sort((a, b) => {
    const aHit = stopId && a.affectedStops.some(s => s.stopId === stopId) ? 0 : 1;
    const bHit = stopId && b.affectedStops.some(s => s.stopId === stopId) ? 0 : 1;
    return aHit - bHit || new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  return (
    <Card className="flex flex-col">
      <CardHeader title="Crowd forecast" subtitle="Nearby events, next 3 days" count={events.length} countTone="warn" icon={<Users size={15} />} />
      {isLoading && (
        <div className="p-4 space-y-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      )}
      {!isLoading && events.length === 0 && (
        <EmptyState className="flex-1">No major events near the network in the next 3 days.</EmptyState>
      )}
      {!isLoading && events.length > 0 && (
        <ul className="divide-y divide-line" role="list">
          {sorted.map(e => <EventRow key={e.id} event={e} activeStopId={stopId} />)}
        </ul>
      )}
    </Card>
  );
}
