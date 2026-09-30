"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Window from "./Window";
import DirectionBoard from "./DirectionBoard";
import AlertsPanel, { severityTone } from "./AlertsPanel";
import LiveFeed from "./LiveFeed";
import EventsPanel from "./EventsPanel";
import { usePredictions } from "@/hooks/usePredictions";
import { useAlerts } from "@/hooks/useAlerts";
import { useHistoricalContext } from "@/hooks/useHistoricalContext";
import { getLine, MODE_LABELS } from "@/lib/lines";
import { relativeTime } from "@/lib/utils";
import { Accessible, AlertTriangle, ChevronLeft, Clock as ClockIcon, Refresh } from "./icons";
import { LineBadge, StatusDot, TONE_TEXT, type Tone } from "./ui";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Props {
  stopId: string;
  stopName: string;
  lineId?: string;
  accessible?: boolean;
}

export default function DashboardLayout({ stopId, stopName, lineId = "Green", accessible }: Props) {
  const router = useRouter();
  const line = getLine(lineId) ?? getLine("Green")!;
  const { predictions, isLoading, isValidating, isError, refresh } = usePredictions(stopId, lineId);
  const { alerts } = useAlerts(stopId, lineId);
  const historical = useHistoricalContext(stopId, "all");

  // Track when the board last changed, and tick so "Xs ago" stays honest
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const prevKey = useRef("");
  useEffect(() => {
    if (isLoading) return;
    const key = JSON.stringify(predictions);
    if (key !== prevKey.current) {
      prevKey.current = key;
      setLastUpdated(new Date());
      setNow(Date.now());
    }
  }, [predictions, isLoading]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const statusTone: Tone = isError ? "bad" : isLoading ? "warn" : "good";
  const statusLabel = isError ? "Connection issue" : isLoading ? "Connecting…" : isValidating ? "Updating…" : "Live";

  const topAlert = [...alerts].sort((a, b) => b.severity - a.severity)[0];
  const showBranch = line.routes.length > 1;
  const todayName = DAY_NAMES[new Date().getDay()];

  const lineHref = `/?mode=${line.mode}&line=${line.id}`;

  return (
    <Window
      id="stop"
      dock="right"
      width={500}
      accent={line.color}
      accentText={line.textColor}
      eyebrow={`${MODE_LABELS[line.mode]} · ${line.name}`}
      title={stopName}
      headerExtra={accessible ? <Accessible size={17} className="shrink-0 opacity-90" aria-label="Accessible station" /> : undefined}
      onClose={() => router.push(lineHref)}
      closeLabel={`Back to ${line.name}`}
    >
      <div className="@container p-4 space-y-3.5">

        {/* Status row */}
        <div className="flex items-center justify-between gap-3 fade-rise">
          <Link href={lineHref} className="inline-flex items-center gap-1 text-[13px] font-bold text-ink-3 hover:text-ink transition-colors -ml-1 px-1 rounded-md focus-ring min-w-0">
            <ChevronLeft size={16} className="shrink-0" />
            <LineBadge line={line} size="sm" />
            <span className="truncate">All stops</span>
          </Link>
          <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-3 shrink-0">
            <StatusDot tone={statusTone} pulse={statusTone === "good"} />
            <span suppressHydrationWarning>
              {isError ? <span className={TONE_TEXT.bad}>Can&apos;t reach MBTA — retrying</span> : lastUpdated ? `${statusLabel} · ${relativeTime(lastUpdated, now)}` : "Loading…"}
            </span>
            <button
              type="button"
              onClick={refresh}
              aria-label="Refresh departures"
              title="Refresh departures"
              className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-black/[0.05] text-ink-2 hover:text-ink hover:bg-black/10 btn-pop focus-ring"
            >
              <Refresh size={15} className={isValidating ? "spin" : ""} />
            </button>
          </div>
        </div>

        {/* Most severe alert, surfaced above the boards */}
        {topAlert && (
          <div className={`card flex items-start gap-3 px-4 py-3 border-l-4 fade-rise ${
            severityTone(topAlert.severity) === "bad" ? "!border-l-red-500" : severityTone(topAlert.severity) === "warn" ? "!border-l-amber-400" : "!border-l-sky-400"
          }`}>
            <AlertTriangle size={16} className={`${TONE_TEXT[severityTone(topAlert.severity)]} shrink-0 mt-0.5`} />
            <p className="text-[13px] font-medium text-ink-2 leading-snug">
              <span className="font-bold text-ink">{topAlert.effect.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase())}.</span>{" "}
              {topAlert.header}
              {alerts.length > 1 && <span className="text-ink-3"> · {alerts.length - 1} more below</span>}
            </p>
          </div>
        )}

        {/* Departure boards */}
        <div className="grid gap-3.5 @2xl:grid-cols-2">
          <div className="stagger" style={{ "--stagger-i": 2 } as React.CSSProperties}>
            <DirectionBoard predictions={predictions} isLoading={isLoading} direction={1} fallbackLabel="Inbound" line={line} now={now} />
          </div>
          <div className="stagger" style={{ "--stagger-i": 4 } as React.CSSProperties}>
            <DirectionBoard predictions={predictions} isLoading={isLoading} direction={0} fallbackLabel="Outbound" line={line} now={now} />
          </div>
        </div>

        {/* Historical delay context (Green Line stops only) */}
        {historical && historical.sampleSize > 0 && (
          <div className="card flex items-start gap-3 px-4 py-3">
            <ClockIcon size={16} className="text-ink-3 shrink-0 mt-0.5" />
            <p className="text-[13px] font-medium text-ink-2 leading-snug">
              Trains here typically run{" "}
              <span className="font-bold text-ink num">
                {historical.avgDelayMinutes > 0 ? `${historical.avgDelayMinutes} min late` : "on time"}
              </span>{" "}
              at this hour on {todayName}s; one in four is{" "}
              <span className="font-bold text-ink num">{historical.p75DelayMinutes}+ min</span> late.
              <span className="text-ink-3"> Based on {historical.sampleSize.toLocaleString()} past trips.</span>
            </p>
          </div>
        )}

        {/* Context */}
        <AlertsPanel stopId={stopId} lineId={line.id} />
        <EventsPanel stopId={stopId} />
        <LiveFeed predictions={predictions} showBranch={showBranch} now={now} />

        <footer className="pt-1 pb-2 px-1 text-[11.5px] font-medium text-ink-3 leading-relaxed">
          Departures refresh every 30 seconds from the MBTA V3 API. Delay is predicted arrival minus the schedule.
        </footer>
      </div>
    </Window>
  );
}
