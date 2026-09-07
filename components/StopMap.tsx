"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVehicles } from "@/hooks/useVehicles";
import { useShapes } from "@/hooks/useShapes";
import { useStopPositions } from "@/hooks/useStopPositions";
import { getLine, inferLineId } from "@/lib/lines";
import { MapEngine, type HoverInfo, type StopDatum } from "./map3d/engine";
import { TILE_ATTRIBUTION } from "./map3d/tiles";
import { Crosshair, Minus, Plus } from "./icons";
import { Spinner } from "./ui";

// Route colors in overview mode (keyed by line, shapes arrive keyed by route id)
const OVERVIEW_LINES: { id: string; label: string; color: string }[] = [
  { id: "Red",      label: "Red Line",      color: "#DA291C" },
  { id: "Orange",   label: "Orange Line",   color: "#ED8B00" },
  { id: "Blue",     label: "Blue Line",     color: "#003DA5" },
  { id: "Green",    label: "Green Line",    color: "#00843D" },
  { id: "Mattapan", label: "Mattapan Line", color: "#80276C" },
];
const OVERVIEW_LINE_COLORS: Record<string, string> = Object.fromEntries(OVERVIEW_LINES.map(l => [l.id, l.color]));

function overviewColor(routeId: string): string {
  return OVERVIEW_LINE_COLORS[inferLineId(routeId)] ?? "#8b8b94";
}

interface Props {
  currentStopId?: string;
  lineId?: string; // undefined or "overview" = all-subway overview
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="w-9 h-9 flex items-center justify-center text-fg-2 hover:text-fg hover:bg-white/8 active:bg-white/12 transition-colors focus-ring first:rounded-t-lg last:rounded-b-lg"
    >
      {children}
    </button>
  );
}

export default function StopMap({ currentStopId, lineId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const router = useRouter();
  // Latest router/lineId for engine callbacks, without re-creating the engine
  const routerRef = useRef(router);
  const lineIdRef = useRef(lineId);
  useEffect(() => {
    routerRef.current = router;
    lineIdRef.current = lineId;
  }, [router, lineId]);

  const [hover, setHover] = useState<{ info: HoverInfo; x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOverview = !lineId || lineId === "overview";
  const dataKey = isOverview ? "overview" : lineId;

  const { vehicles } = useVehicles(dataKey, 10_000);
  const { shapes, isError: shapesError } = useShapes(dataKey);
  const stopPositions = useStopPositions(isOverview ? undefined : lineId);

  const line = lineId ? getLine(lineId) : null;
  const lineColor = line?.color ?? "#22c55e";
  const ready = Object.keys(shapes).length > 0;

  // Mount the engine once
  useEffect(() => {
    const container = containerRef.current;
    if (!container || engineRef.current) return;
    const engine = new MapEngine(container, {
      onStopClick: stopId => {
        const lid = lineIdRef.current;
        if (lid && lid !== "overview") routerRef.current.push(`/stop/${lid}/${stopId}`);
      },
      onHover: (info, x, y) => setHover(info ? { info, x, y } : null),
      onError: message => setError(message),
    });
    engineRef.current = engine;
    if (process.env.NODE_ENV === "development") {
      (window as unknown as Record<string, unknown>).__mapEngine = engine;
    }
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Route shapes → glowing lines + animation tracks; refit camera per line change
  const fittedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !ready) return;
    const colors: Record<string, string> = {};
    for (const key of Object.keys(shapes)) {
      colors[key] = isOverview ? overviewColor(key) : lineColor;
    }
    const fit = fittedKeyRef.current !== dataKey && !currentStopId;
    fittedKeyRef.current = dataKey ?? null;
    engine.setShapes(shapes, colors, fit);
  }, [shapes, ready, lineColor, isOverview, dataKey, currentStopId]);

  // Stops
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (isOverview) {
      engine.setStops([], lineColor);
      return;
    }
    const stops: StopDatum[] = Object.entries(stopPositions)
      .filter(([, p]) => p.isStation)
      .map(([id, p]) => ({ id, lat: p.lat, lon: p.lon, name: p.name }));
    engine.setStops(stops, lineColor, currentStopId);
  }, [stopPositions, lineColor, isOverview, currentStopId]);

  // Fly to the selected stop
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !currentStopId || isOverview) return;
    const pos = stopPositions[currentStopId];
    if (!pos) return;
    engine.flyTo(pos.lat, pos.lon, 110);
  }, [currentStopId, stopPositions, isOverview]);

  // Live vehicles → animated trains
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setVehicles(vehicles, isOverview ? overviewColor : () => lineColor);
  }, [vehicles, lineColor, isOverview]);

  const liveLabel = isOverview
    ? `${vehicles.length} trains live across the subway`
    : `${vehicles.length} ${line?.mode === "bus" ? "bus" : line?.mode === "ferry" ? "boat" : "train"}${vehicles.length === 1 ? "" : line?.mode === "bus" ? "es" : "s"} live`;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b0c10] select-none">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Loading / error veil */}
      <div
        className={`absolute inset-0 flex items-center justify-center bg-[#0b0c10] transition-opacity duration-500 ${ready && !error ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        aria-hidden={ready && !error}
      >
        {error ? (
          <div className="text-center px-6">
            <p className="text-[14px] font-medium text-fg">Map unavailable</p>
            <p className="text-[13px] text-fg-3 mt-1">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 text-[13px] font-medium px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/12 text-fg transition-colors focus-ring"
            >
              Reload
            </button>
          </div>
        ) : shapesError ? (
          <div className="text-center px-6">
            <p className="text-[14px] font-medium text-fg">Couldn&apos;t load the network</p>
            <p className="text-[13px] text-fg-3 mt-1">The MBTA API didn&apos;t respond. Retrying automatically.</p>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 text-[13px] text-fg-3">
            <Spinner /> Loading network…
          </div>
        )}
      </div>

      {/* Live chip */}
      <div className="absolute top-3 left-3 flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 pointer-events-none">
        <span className="relative flex w-2 h-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: lineColor }} />
          <span className="relative inline-flex rounded-full w-2 h-2" style={{ background: lineColor }} />
        </span>
        <span className="text-[12px] font-medium text-fg-2 num">{liveLabel}</span>
      </div>

      {/* Legend (overview only) */}
      {isOverview && (
        <div className="absolute top-3 right-3 hidden lg:flex flex-col gap-1.5 px-3 py-2.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 pointer-events-none">
          {OVERVIEW_LINES.map(l => (
            <div key={l.id} className="flex items-center gap-2 text-[12px] text-fg-2">
              <span className="w-4 h-[3px] rounded-full" style={{ background: l.color }} />
              {l.label}
            </div>
          ))}
        </div>
      )}

      {/* Camera controls */}
      <div className="absolute bottom-8 right-3 flex flex-col rounded-lg bg-black/60 backdrop-blur-md border border-white/10 divide-y divide-white/10 overflow-hidden">
        <ControlButton label="Zoom in" onClick={() => engineRef.current?.zoomBy(0.6)}><Plus size={16} /></ControlButton>
        <ControlButton label="Zoom out" onClick={() => engineRef.current?.zoomBy(1 / 0.6)}><Minus size={16} /></ControlButton>
        <ControlButton label="Reset view" onClick={() => engineRef.current?.resetView()}><Crosshair size={16} /></ControlButton>
      </div>

      {/* Attribution */}
      <div className="absolute bottom-0 left-0 px-2 py-1 text-[10px] leading-none text-fg-3/80 bg-black/45 rounded-tr-md pointer-events-none">
        {TILE_ATTRIBUTION}
      </div>

      {/* Hover tooltip */}
      {hover && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg bg-[#0f1014]/95 backdrop-blur-md border border-white/10 shadow-xl shadow-black/40"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="text-[13px] font-semibold text-fg leading-tight">{hover.info.title}</div>
          <div className="text-[12px] text-fg-3 mt-0.5">{hover.info.subtitle}</div>
        </div>
      )}
    </div>
  );
}
