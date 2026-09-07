"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppShell, { type Crumb } from "@/components/AppShell";
import ModePicker from "@/components/ModePicker";
import LinePicker from "@/components/LinePicker";
import StopPicker from "@/components/StopPicker";
import StopMap from "@/components/StopMapDynamic";
import { LineBadge, Spinner } from "@/components/ui";
import type { Mode } from "@/lib/lines";
import { getLine, LINES_BY_MODE, MODE_LABELS } from "@/lib/lines";

const MODES = new Set<Mode>(["subway", "commuter_rail", "bus", "ferry"]);

function HomeContent() {
  const params = useSearchParams();
  const rawMode = params?.get("mode") ?? null;
  const mode: Mode | null = rawMode && MODES.has(rawMode as Mode) ? (rawMode as Mode) : null;
  const lineId = params?.get("line") ?? null;
  const line = lineId ? getLine(lineId) : undefined;

  const step = line ? "stop" : mode ? "line" : "mode";

  const crumbs: Crumb[] = [];
  if (mode) crumbs.push({ label: MODE_LABELS[mode], href: `/?mode=${mode}` });
  if (line) crumbs.push({ label: line.name, color: line.color });

  return (
    <AppShell
      accent={line?.color ?? "#22c55e"}
      crumbs={crumbs}
      status={{ tone: "good", label: "Live data", pulse: true }}
      map={<StopMap lineId={line?.id} />}
    >
      <div className="max-w-[640px] mx-auto px-5 sm:px-8 py-8 sm:py-10">
        <div key={step + (line?.id ?? mode ?? "")} className="fade-rise">
          {step === "mode" && (
            <>
              <p className="eyebrow mb-3">Real-time MBTA</p>
              <h1 className="text-[30px] sm:text-[36px] font-bold tracking-tight leading-[1.05] text-fg">
                Where are you headed?
              </h1>
              <p className="text-[15px] text-fg-2 mt-3 mb-8 max-w-[34rem] leading-relaxed">
                Live departures, delay context, service alerts and crowd forecasts for every MBTA line.
                Pick a mode to get started.
              </p>
              <ModePicker />
            </>
          )}

          {step === "line" && mode && (
            <>
              <p className="eyebrow mb-3">Step 2 of 3</p>
              <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-[1.05] text-fg">Choose a line</h1>
              <p className="text-[14px] text-fg-3 mt-2 mb-6">
                {MODE_LABELS[mode]} · {LINES_BY_MODE[mode].length} lines
              </p>
              <LinePicker mode={mode} />
            </>
          )}

          {step === "stop" && line && (
            <>
              <p className="eyebrow mb-3">Step 3 of 3</p>
              <div className="flex items-center gap-3">
                <LineBadge line={line} size="lg" />
                <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-[1.05] text-fg">Choose a stop</h1>
              </div>
              <p className="text-[14px] text-fg-3 mt-2 mb-6">
                {line.name} · {line.terminus[0]} <span className="text-fg-3/60">↔</span> {line.terminus[1]}
              </p>
              <StopPicker lineId={line.id} />
            </>
          )}
        </div>

        <footer className="mt-12 pt-5 border-t border-line text-[12px] text-fg-3 leading-relaxed">
          Data from the MBTA V3 API. Departures refresh every 30 seconds; vehicle positions every 10.
          Not affiliated with the MBTA.
        </footer>
      </div>
    </AppShell>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="h-dvh flex items-center justify-center bg-app text-fg-3 text-[13px] gap-2.5">
          <Spinner /> Loading…
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
