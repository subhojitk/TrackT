"use client";

import { useEvents } from "@/hooks/useEvents";
import { getStop } from "@/lib/stops";
import type { TransitEvent } from "@/types/mbta";

const SPORT_ICON: Record<string, string> = {
  MLB: "⚾",
  NHL: "🏒",
  NBA: "🏀",
  EVENT: "🎵",
};

function eventIcon(sport: string, name: string): string {
  if (sport !== "EVENT") return SPORT_ICON[sport] ?? "🎵";
  const n = name.toLowerCase();
  if (n.includes("comedy") || n.includes("laugh") || n.includes("stand-up")) return "🎤";
  if (n.includes("ballet") || n.includes("dance")) return "🩰";
  if (n.includes("opera")) return "🎭";
  if (n.includes("theatre") || n.includes("theater") || n.includes("musical")) return "🎭";
  if (n.includes("symphony") || n.includes("orchestra") || n.includes("classical")) return "🎻";
  if (n.includes("festival") || n.includes("fest")) return "🎪";
  if (n.includes("film") || n.includes("movie") || n.includes("cinema")) return "🎬";
  if (n.includes("conference") || n.includes("expo") || n.includes("summit")) return "📋";
  return "🎵";
}

const CROWD_LABEL: Record<string, string> = {
  "medium":    "MODERATE",
  "high":      "BUSY",
  "very-high": "VERY BUSY",
};

const CROWD_BAR: Record<string, { filled: number; cls: string }> = {
  "medium":    { filled: 2, cls: "bg-yellow-500" },
  "high":      { filled: 3, cls: "bg-orange-500" },
  "very-high": { filled: 5, cls: "bg-red-500" },
};

function formatEventTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const dayLabel = sameDay(d, today) ? "Today" : sameDay(d, tomorrow) ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return { dayLabel, time };
}

function EventCard({ event, activeStopId }: { event: TransitEvent; activeStopId?: string }) {
  const isActive = activeStopId ? event.affectedStops.some(s => s.stopId === activeStopId) : false;
  const { dayLabel, time } = formatEventTime(event.startTime);
  const bar = CROWD_BAR[event.crowdLevel];

  return (
    <div className={`border rounded px-2.5 py-2 space-y-1.5 transition-colors ${
      isActive
        ? "border-orange-500/60 bg-orange-950/30"
        : "border-zinc-800 bg-zinc-900/40"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm shrink-0">{eventIcon(event.sport, event.name)}</span>
          <span className="text-[11px] font-semibold text-zinc-200 truncate">{event.name}</span>
        </div>
        <span className={`text-[9px] font-bold tracking-widest shrink-0 ${bar.cls.replace("bg-", "text-")}`}>
          {CROWD_LABEL[event.crowdLevel]}
        </span>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <span className="text-zinc-400">{dayLabel}</span>
        <span>·</span>
        <span>{time}</span>
        <span>·</span>
        <span>{event.venue}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[9px] tracking-widest text-zinc-600">EXPECT CROWDS AT</span>
        {event.affectedStops.map(({ stopId, lineId }) => {
          const stop = getStop(stopId);
          const label = stop?.name ?? stopId;
          return (
            <a
              key={stopId}
              href={`/stop/${lineId}/${stopId}`}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                stopId === activeStopId
                  ? "bg-orange-500/30 text-orange-300 ring-1 ring-orange-500/50"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              }`}
            >
              {label}
            </a>
          );
        })}
        <div className="flex gap-0.5 ml-auto">
          {[1,2,3,4,5].map(n => (
            <div
              key={n}
              className={`w-2 h-2 rounded-sm ${n <= bar.filled ? bar.cls : "bg-zinc-800"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function EventsPanel({ stopId }: { stopId?: string }) {
  const { events, isLoading } = useEvents();
  const sorted = stopId
    ? [...events].sort((a, b) => {
        const aHit = a.affectedStops.some(s => s.stopId === stopId) ? -1 : 1;
        const bHit = b.affectedStops.some(s => s.stopId === stopId) ? -1 : 1;
        return aHit - bHit || new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      })
    : events;

  return (
    <div className="flex flex-col h-full min-w-0 border-r border-zinc-800 last:border-r-0" style={{ flex: "0 0 35%" }}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
        <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400">MAJOR EVENTS</span>
        {events.length > 0 && (
          <span className="text-[10px] font-bold text-orange-400 bg-orange-900/30 px-1 rounded">
            {events.length}
          </span>
        )}
        <span className="text-[9px] text-zinc-600 ml-auto">NEXT 3 DAYS</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading && (
          <div className="flex items-center justify-center h-full text-[11px] text-zinc-600 tracking-widest">
            LOADING…
          </div>
        )}
        {!isLoading && events.length === 0 && (
          <div className="flex items-center justify-center h-full text-[11px] text-zinc-600 tracking-widest">
            NO EVENTS FOUND
          </div>
        )}
        {sorted.map(e => (
          <EventCard key={e.id} event={e} activeStopId={stopId} />
        ))}
      </div>
    </div>
  );
}
