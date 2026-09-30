"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Window from "@/components/Window";
import ModePicker, { MODE_COLORS } from "@/components/ModePicker";
import LinePicker from "@/components/LinePicker";
import StopPicker from "@/components/StopPicker";
import { ChevronLeft } from "@/components/icons";
import type { Mode } from "@/lib/lines";
import { getLine, LINES_BY_MODE, MODE_LABELS } from "@/lib/lines";

const MODES = new Set<Mode>(["subway", "commuter_rail", "bus", "ferry"]);

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-bold text-ink-3 hover:text-ink transition-colors mb-3 -ml-1 px-1 rounded-md focus-ring">
      <ChevronLeft size={16} /> {label}
    </Link>
  );
}

function Explorer() {
  const router = useRouter();
  const params = useSearchParams();
  const rawMode = params?.get("mode") ?? null;
  const line = getLine(params?.get("line") ?? "");
  const mode: Mode | null = line?.mode ?? (rawMode && MODES.has(rawMode as Mode) ? (rawMode as Mode) : null);

  const step = line ? "stop" : mode ? "line" : "mode";

  const header =
    step === "stop" && line
      ? { accent: line.color, text: line.textColor, eyebrow: `${MODE_LABELS[line.mode]} · Pick a stop`, title: line.name, close: `/?mode=${line.mode}` }
      : step === "line" && mode
        ? { accent: MODE_COLORS[mode].bg, text: MODE_COLORS[mode].text, eyebrow: `${LINES_BY_MODE[mode].length} lines`, title: MODE_LABELS[mode], close: "/" }
        : { accent: "#1d2433", text: "white" as const, eyebrow: "Live MBTA · 3D", title: "Where to?", close: null };

  return (
    <Window
      id="explorer"
      dock="left"
      width={400}
      accent={header.accent}
      accentText={header.text}
      eyebrow={header.eyebrow}
      title={header.title}
      onClose={header.close ? () => router.push(header.close!) : undefined}
      closeLabel="Back"
    >
      <div key={step + (line?.id ?? mode ?? "")} className="p-4 fade-rise">
        {step === "mode" && (
          <>
            <p className="text-[14px] font-medium text-ink-2 leading-relaxed mb-4 px-1">
              Every train on the map is live. Pick a mode, tap any station, or click a train to ride along.
            </p>
            <ModePicker />
          </>
        )}

        {step === "line" && mode && (
          <>
            <BackLink href="/" label="All modes" />
            <LinePicker mode={mode} />
          </>
        )}

        {step === "stop" && line && (
          <>
            <BackLink href={`/?mode=${line.mode}`} label={MODE_LABELS[line.mode]} />
            <p className="text-[13px] font-semibold text-ink-3 mb-3 px-1">
              {line.terminus[0]} <span className="opacity-60">↔</span> {line.terminus[1]}
            </p>
            <StopPicker lineId={line.id} />
          </>
        )}

        <footer className="mt-6 pt-4 border-t border-line text-[11.5px] font-medium text-ink-3 leading-relaxed px-1">
          Live data from the MBTA V3 API. Departures refresh every 30 s, vehicles every 10 s. Not affiliated with the MBTA.
        </footer>
      </div>
    </Window>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <Explorer />
    </Suspense>
  );
}
