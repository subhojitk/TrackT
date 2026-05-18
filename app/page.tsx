"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ModePicker from "@/components/ModePicker";
import LinePicker from "@/components/LinePicker";
import StopPicker from "@/components/StopPicker";
import Breadcrumb from "@/components/Breadcrumb";
import StopMap from "@/components/StopMapDynamic";
import type { Mode } from "@/lib/lines";
import { getLine } from "@/lib/lines";

function HomeContent() {
  const params = useSearchParams();
  const mode = params.get("mode") as Mode | null;
  const lineId = params.get("line");
  const line = lineId ? getLine(lineId) : null;

  const step = lineId ? "stop" : mode ? "line" : "mode";

  return (
    <div className="flex flex-col bg-zinc-950 font-mono" style={{ height: "100dvh" }}>
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80 shrink-0">
        <span className="font-bold tracking-[0.2em] text-sm" style={{ color: line?.color ?? "#4ade80" }}>
          TRACKT
        </span>
        <span className="text-zinc-600 text-xs tracking-widest">MBTA REAL-TIME</span>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: map — always present, overview when nothing selected */}
        <div className="hidden md:block relative border-r border-zinc-800 shrink-0 h-full" style={{ width: "580px" }}>
          <StopMap lineId={lineId ?? undefined} fillContainer />
        </div>

        {/* RIGHT: picker steps — scrollable */}
        <div className="flex flex-col flex-1 overflow-y-auto min-w-0">
          <div className="p-5 max-w-lg w-full mx-auto">
            {step !== "mode" && (
              <Breadcrumb mode={mode ?? undefined} lineId={lineId ?? undefined} />
            )}

            {step === "mode" && (
              <div className="pt-4">
                <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mb-1">TrackT</h1>
                <p className="text-zinc-500 text-sm mb-6">Real-time MBTA departures & delay context.</p>
                <ModePicker />
              </div>
            )}

            {step === "line" && mode && (
              <LinePicker mode={mode} />
            )}

            {step === "stop" && lineId && (
              <StopPicker lineId={lineId} />
            )}
          </div>
        </div>

      </div>

      <footer className="border-t border-zinc-800 px-4 py-2 text-[10px] text-zinc-700 text-center font-mono shrink-0">
        Data from MBTA V3 API · Refreshes every 30s
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center bg-zinc-950 text-zinc-600 text-xs tracking-widest font-mono" style={{ height: "100dvh" }}>
        LOADING…
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
