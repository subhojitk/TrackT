"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVehicles } from "@/hooks/useVehicles";
import { useShapes } from "@/hooks/useShapes";
import { useStopPositions } from "@/hooks/useStopPositions";
import { getLine, inferLineId } from "@/lib/lines";
import { MapEngine, type HoverInfo, type StopDatum } from "./map3d/engine";

// Route colors in overview mode (keyed by line, shapes arrive keyed by route id)
const OVERVIEW_LINE_COLORS: Record<string, string> = {
  Red:      "#DA291C",
  Orange:   "#ED8B00",
  Blue:     "#003DA5",
  Green:    "#00843D",
  Mattapan: "#80276C",
};

function overviewColor(routeId: string): string {
  return OVERVIEW_LINE_COLORS[inferLineId(routeId)] ?? "#8b8b94";
}

interface Props {
  currentStopId?: string;
  fillContainer?: boolean;
  lineId?: string; // undefined or "overview" = all-subway overview
}

export default function StopMap({ currentStopId, fillContainer, lineId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const lineIdRef = useRef(lineId);
  lineIdRef.current = lineId;

  const [hover, setHover] = useState<{ info: HoverInfo; x: number; y: number } | null>(null);

  const isOverview = !lineId || lineId === "overview";
  const dataKey = isOverview ? "overview" : lineId;

  const { vehicles } = useVehicles(dataKey, 10_000);
  const { shapes } = useShapes(dataKey);
  const stopPositions = useStopPositions(isOverview ? undefined : lineId);

  const line = lineId ? getLine(lineId) : null;
  const lineColor = line?.color ?? "#22c55e";

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
    if (!engine || Object.keys(shapes).length === 0) return;
    const colors: Record<string, string> = {};
    for (const key of Object.keys(shapes)) {
      colors[key] = isOverview ? overviewColor(key) : lineColor;
    }
    const fit = fittedKeyRef.current !== dataKey && !currentStopId;
    fittedKeyRef.current = dataKey ?? null;
    engine.setShapes(shapes, colors, fit);
  }, [shapes, lineColor, isOverview, dataKey, currentStopId]);

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

  return (
    <div
      className={fillContainer ? "absolute inset-0 overflow-hidden" : "relative w-full h-64 rounded-lg overflow-hidden"}
      style={{ background: "#0a0a0e" }}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Live chip */}
      <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/10 pointer-events-none select-none">
        <span className="relative flex w-1.5 h-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: lineColor }} />
          <span className="relative inline-flex rounded-full w-1.5 h-1.5" style={{ background: lineColor }} />
        </span>
        <span className="text-[10px] font-bold tracking-[0.18em] text-zinc-300">
          {isOverview ? "SYSTEM LIVE" : `${vehicles.length} TRAIN${vehicles.length === 1 ? "" : "S"} LIVE`}
        </span>
      </div>

      {/* Hover tooltip */}
      {hover && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg bg-black/80 backdrop-blur-md border border-white/10 shadow-xl"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="text-xs font-bold text-zinc-100 leading-tight">{hover.info.title}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">{hover.info.subtitle}</div>
        </div>
      )}
    </div>
  );
}
