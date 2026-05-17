"use client";

import { useEffect, useState } from "react";
import StopMap from "./StopMapDynamic";
import DirectionPanel from "./DirectionPanel";
import AlertsPanel from "./AlertsPanel";
import LiveFeed from "./LiveFeed";
import StopSelector from "./StopSelector";
import EventsPanel from "./EventsPanel";
import { usePredictions } from "@/hooks/usePredictions";

function Clock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () =>
      setTime(new Date().toLocaleTimeString("en-US", { hour12: false }));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums text-green-400">{time}</span>;
}

function StatusDot({ isLoading, isError }: { isLoading: boolean; isError: boolean }) {
  const cls = isError
    ? "bg-red-500"
    : isLoading
    ? "bg-yellow-500 animate-pulse"
    : "bg-green-500 animate-pulse";
  return <span className={`w-1.5 h-1.5 rounded-full ${cls}`} />;
}

interface Props {
  stopId: string;
  stopName: string;
}

export default function DashboardLayout({ stopId, stopName }: Props) {
  const { predictions, isLoading, isError } = usePredictions(stopId);

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div className="flex flex-col bg-zinc-950 font-mono text-zinc-100 overflow-hidden" style={{ height: "100dvh" }}>

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/80 shrink-0 gap-4">
        <div className="flex items-center gap-3">
          <a href="/" className="text-green-400 font-bold tracking-[0.2em] text-sm hover:text-green-300 transition-colors">
            TRACKT
          </a>
          <span className="text-zinc-700">|</span>
          <StatusDot isLoading={isLoading} isError={isError} />
          <span className="text-zinc-500 text-xs tracking-widest">LIVE</span>
        </div>

        <div className="flex-1 max-w-xs">
          <StopSelector currentStopId={stopId} />
        </div>

        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="tracking-widest hidden sm:block">MBTA GREEN LINE</span>
          <Clock />
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: Map — only mounted on desktop so useVehicles doesn't poll on mobile */}
        {isDesktop && (
          <div className="flex flex-col border-r border-zinc-800 shrink-0" style={{ width: "580px" }}>
            <div className="px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/60">
              <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400">NETWORK MAP</span>
            </div>
            <div className="flex-1 relative">
              <StopMap currentStopId={stopId} fillContainer />
            </div>
          </div>
        )}

        {/* Right: panels */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">

          {/* Stop name bar */}
          <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/40 shrink-0">
            <span className="text-sm font-bold tracking-wide text-zinc-100">{stopName.toUpperCase()}</span>
            <span className="ml-3 text-[10px] text-zinc-600 tracking-widest">GREEN LINE · MBTA</span>
          </div>

          {/* Inbound / Outbound */}
          <div className="flex flex-1 border-b border-zinc-800 overflow-hidden min-h-0">
            <DirectionPanel predictions={predictions} isLoading={isLoading} direction={1} label="INBOUND" />
            <DirectionPanel predictions={predictions} isLoading={isLoading} direction={0} label="OUTBOUND" />
          </div>

          {/* Events + Alerts + Live Feed */}
          <div className="flex shrink-0 overflow-hidden" style={{ height: "220px" }}>
            <EventsPanel stopId={stopId} />
            <AlertsPanel stopId={stopId} />
            <LiveFeed predictions={predictions} />
          </div>

        </div>
      </div>
    </div>
  );
}
