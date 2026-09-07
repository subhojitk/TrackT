"use client";

import { useEffect, useRef, useState } from "react";
import AppShell, { type Crumb } from "./AppShell";
import StopMap from "./StopMapDynamic";
import DirectionBoard from "./DirectionBoard";
import AlertsPanel, { severityTone } from "./AlertsPanel";
import LiveFeed from "./LiveFeed";
import EventsPanel from "./EventsPanel";
import { usePredictions } from "@/hooks/usePredictions";
import { useAlerts } from "@/hooks/useAlerts";
import { useHistoricalContext } from "@/hooks/useHistoricalContext";
import { getLine, MODE_LABELS } from "@/lib/lines";
import { relativeTime } from "@/lib/utils";
import { Accessible, AlertTriangle, Clock as ClockIcon, Refresh } from "./icons";
import { LineBadge, Pill, TONE_TEXT, type Tone } from "./ui";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Props {
  stopId: string;
  stopName: string;
  lineId?: string;
  accessible?: boolean;
}

export default function DashboardLayout({ stopId, stopName, lineId = "Green", accessible }: Props) {
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

  const crumbs: Crumb[] = [
    { label: MODE_LABELS[line.mode], href: `/?mode=${line.mode}` },
    { label: line.name, href: `/?mode=${line.mode}&line=${line.id}`, color: line.color },
    { label: stopName },
  ];

  const topAlert = [...alerts].sort((a, b) => b.severity - a.severity)[0];
  const showBranch = line.routes.length > 1;
  const todayName = DAY_NAMES[new Date().getDay()];

  return (
    <AppShell
      accent={line.color}
      crumbs={crumbs}
      status={{ tone: statusTone, label: statusLabel, pulse: statusTone === "good" }}
      map={<StopMap currentStopId={stopId} lineId={line.id} />}
    >
      <div className="@container max-w-[1080px] mx-auto px-5 sm:px-8 py-6 sm:py-8 space-y-5 fade-rise">

        {/* Stop header */}
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-2.5">
              <LineBadge line={line} size="lg" />
              <span className="text-[13px] font-medium text-fg-2">{line.name}</span>
              {accessible && (
                <Pill tone="neutral"><Accessible size={12} /> Accessible</Pill>
              )}
            </div>
            <h1 className="text-[30px] sm:text-[36px] font-bold tracking-tight leading-none text-fg">{stopName}</h1>
            <p className="text-[13px] text-fg-3 mt-2.5">
              {line.terminus[0]} <span className="text-fg-3/60">↔</span> {line.terminus[1]}
            </p>
          </div>

          <div className="flex items-center gap-2 text-[12px] text-fg-3">
            <span suppressHydrationWarning>
              {isError ? <span className={TONE_TEXT.bad}>Couldn&apos;t reach the MBTA API — retrying</span> : lastUpdated ? `Updated ${relativeTime(lastUpdated, now)}` : "Loading departures…"}
            </span>
            <button
              type="button"
              onClick={refresh}
              aria-label="Refresh departures"
              title="Refresh departures"
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-fg-2 hover:text-fg hover:bg-white/8 transition-colors focus-ring"
            >
              <Refresh size={15} className={isValidating ? "spin" : ""} />
            </button>
          </div>
        </header>

        {/* Most severe alert, surfaced above the boards */}
        {topAlert && (
          <div className={`card flex items-start gap-3 px-4 py-3 border-l-2 ${
            severityTone(topAlert.severity) === "bad" ? "border-l-red-500" : severityTone(topAlert.severity) === "warn" ? "border-l-amber-400" : "border-l-sky-400"
          }`}>
            <AlertTriangle size={16} className={`${TONE_TEXT[severityTone(topAlert.severity)]} shrink-0 mt-0.5`} />
            <p className="text-[13px] text-fg-2 leading-snug">
              <span className="font-semibold text-fg">{topAlert.effect.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase())}.</span>{" "}
              {topAlert.header}
              {alerts.length > 1 && <span className="text-fg-3"> · {alerts.length - 1} more below</span>}
            </p>
          </div>
        )}

        {/* Historical delay context (Green Line stops only) */}
        {historical && historical.sampleSize > 0 && (
          <div className="card flex items-start gap-3 px-4 py-3">
            <ClockIcon size={16} className="text-fg-3 shrink-0 mt-0.5" />
            <p className="text-[13px] text-fg-2 leading-snug">
              Trains here typically run{" "}
              <span className="font-semibold text-fg num">
                {historical.avgDelayMinutes > 0 ? `${historical.avgDelayMinutes} min late` : "on time"}
              </span>{" "}
              at this hour on {todayName}s; one in four is{" "}
              <span className="font-semibold text-fg num">{historical.p75DelayMinutes}+ min</span> late.
              <span className="text-fg-3"> Based on {historical.sampleSize.toLocaleString()} past trips.</span>
            </p>
          </div>
        )}

        {/* Departure boards */}
        <div className="grid gap-4 @2xl:grid-cols-2">
          <DirectionBoard predictions={predictions} isLoading={isLoading} direction={1} fallbackLabel="Inbound" line={line} now={now} />
          <DirectionBoard predictions={predictions} isLoading={isLoading} direction={0} fallbackLabel="Outbound" line={line} now={now} />
        </div>

        {/* Context */}
        <div className="grid gap-4 @3xl:grid-cols-2">
          <AlertsPanel stopId={stopId} lineId={line.id} />
          <EventsPanel stopId={stopId} />
        </div>

        <LiveFeed predictions={predictions} showBranch={showBranch} now={now} />

        <footer className="pt-2 pb-4 text-[12px] text-fg-3 leading-relaxed">
          Departures refresh every 30 seconds from the MBTA V3 API. Delay is predicted arrival minus the schedule.
        </footer>
      </div>
    </AppShell>
  );
}
