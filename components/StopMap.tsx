"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useVehicles } from "@/hooks/useVehicles";
import { useShapes } from "@/hooks/useShapes";
import { useStopPositions } from "@/hooks/useStopPositions";
import { useNetworkStops, lineColor, NETWORK_LINES } from "@/hooks/useNetworkStops";
import { getLine, inferLineId } from "@/lib/lines";
import { getPadding, setEngine, setOrigin, subscribePadding } from "@/lib/mapBus";
import { MapEngine, type FollowInfo, type HoverInfo, type StopDatum } from "./map3d/engine";
import { TILE_ATTRIBUTION } from "./map3d/tiles";
import { Crosshair, Minus, Plus } from "./icons";
import { Spinner } from "./ui";

/** Shape keys may carry a "~n" branch suffix (Red~1 is the Ashmont branch). */
function overviewColor(routeId: string): string {
  return lineColor(inferLineId(routeId.split("~")[0]));
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
      className="w-10 h-10 flex items-center justify-center text-ink-2 hover:text-ink hover:bg-black/5 active:scale-90 transition focus-ring"
    >
      {children}
    </button>
  );
}

function useClock() {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    update();
    const t = setInterval(update, 10_000);
    return () => clearInterval(t);
  }, []);
  return time;
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
  const [follow, setFollow] = useState<FollowInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pad = useSyncExternalStore(subscribePadding, getPadding, getPadding);
  const clock = useClock();
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The live chip sits left of any right-docked window; drop it when it would hit the search bar
  const chipFits = width - pad.right > 760;

  const isOverview = !lineId || lineId === "overview";
  const dataKey = isOverview ? "overview" : lineId;

  const { vehicles } = useVehicles(dataKey, 10_000);
  const { shapes, isError: shapesError } = useShapes(dataKey);
  const stopPositions = useStopPositions(isOverview ? undefined : lineId);
  const { stations } = useNetworkStops();

  const line = lineId ? getLine(lineId) : null;
  const color = line?.color ?? "#22c55e";
  const ready = Object.keys(shapes).length > 0;

  // Mount the engine once
  useEffect(() => {
    const container = containerRef.current;
    if (!container || engineRef.current) return;
    const engine = new MapEngine(container, {
      onStopClick: (stop, x, y) => {
        const lid = stop.lineId ?? lineIdRef.current;
        if (!lid || lid === "overview") return;
        setOrigin(x, y);
        engine.flyTo(stop.lat, stop.lon, 110);
        routerRef.current.push(`/stop/${lid}/${stop.id}`);
      },
      onHover: (info, x, y) => setHover(info ? { info, x, y } : null),
      onFollow: info => setFollow(info),
      onError: message => setError(message),
    });
    engineRef.current = engine;
    setEngine(engine);
    if (process.env.NODE_ENV === "development") {
      (window as unknown as Record<string, unknown>).__mapEngine = engine;
    }
    return () => {
      setEngine(null);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Route shapes → bold lines + animation tracks; refit camera per line change
  const fittedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !ready) return;
    const colors: Record<string, string> = {};
    for (const key of Object.keys(shapes)) {
      colors[key] = isOverview ? overviewColor(key) : color;
    }
    const fit = fittedKeyRef.current !== dataKey && !currentStopId;
    fittedKeyRef.current = dataKey ?? null;
    engine.setShapes(shapes, colors, fit);
  }, [shapes, ready, color, isOverview, dataKey, currentStopId]);

  // Stations: every subway station in overview, the line's stops otherwise
  const stopData = useMemo<StopDatum[]>(() => {
    if (isOverview) {
      return stations.map(s => ({
        id: s.id, lat: s.lat, lon: s.lon, name: s.name,
        lineId: s.lines[0],
        color: lineColor(s.lines[0]),
        transfer: s.lines.length > 1,
      }));
    }
    return Object.entries(stopPositions)
      .filter(([, p]) => p.isStation)
      .map(([id, p]) => ({ id, lat: p.lat, lon: p.lon, name: p.name }));
  }, [isOverview, stations, stopPositions]);

  useEffect(() => {
    engineRef.current?.setStops(stopData, color, currentStopId);
  }, [stopData, color, currentStopId]);

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
    engine.setVehicles(vehicles, isOverview ? overviewColor : () => color);
  }, [vehicles, color, isOverview]);

  const noun = line?.mode === "bus" ? "bus" : line?.mode === "ferry" ? "boat" : "train";
  const plural = vehicles.length === 1 ? noun : noun === "bus" ? "buses" : `${noun}s`;
  const liveLabel = isOverview ? `${vehicles.length} trains live` : `${vehicles.length} ${plural} live`;
  const liveColor = isOverview ? "#22c55e" : color;

  return (
    <div className="absolute inset-0 overflow-hidden select-none sky-bg">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Loading / error veil */}
      <div
        className={`absolute inset-0 flex items-center justify-center sky-bg transition-opacity duration-700 ${ready && !error ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        aria-hidden={ready && !error}
      >
        {error ? (
          <div className="hud-chip flex-col !items-center text-center px-6 py-5 !rounded-3xl">
            <p className="text-[15px] font-bold text-ink">Map unavailable</p>
            <p className="text-[13px] text-ink-3 mt-1">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 btn-pop text-[13px] font-bold px-4 py-2 rounded-full bg-ink text-white focus-ring"
            >
              Reload
            </button>
          </div>
        ) : shapesError ? (
          <div className="hud-chip flex-col !items-center text-center px-6 py-5 !rounded-3xl">
            <p className="text-[15px] font-bold text-ink">Couldn&apos;t load the network</p>
            <p className="text-[13px] text-ink-3 mt-1">The MBTA API didn&apos;t respond. Retrying automatically.</p>
          </div>
        ) : (
          <div className="hud-chip gap-2.5 text-[13px] font-semibold text-ink-2">
            <Spinner /> Building the city…
          </div>
        )}
      </div>

      {/* Live chip + clock */}
      <div
        className={`absolute top-4 hud-chip pointer-events-none transition-[right,opacity] duration-500 ease-out hidden sm:flex ${chipFits ? "" : "sm:opacity-0"}`}
        style={{ right: 16 + pad.right }}
      >
        <span className="relative flex w-2.5 h-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: liveColor }} />
          <span className="relative inline-flex rounded-full w-2.5 h-2.5" style={{ background: liveColor }} />
        </span>
        <span className="text-[13px] font-bold text-ink num">{liveLabel}</span>
        {clock && <span className="text-[13px] font-semibold text-ink-3 num pl-2 border-l border-black/10" suppressHydrationWarning>{clock}</span>}
      </div>

      {/* Legend (overview only) */}
      {isOverview && (
        <div
          className="absolute top-[4.25rem] hidden lg:flex flex-col gap-1.5 px-3.5 py-3 rounded-2xl hud-panel pointer-events-none transition-[right] duration-500 ease-out"
          style={{ right: 16 + pad.right }}
        >
          {NETWORK_LINES.map(id => {
            const l = getLine(id)!;
            return (
              <div key={id} className="flex items-center gap-2 text-[12px] font-semibold text-ink-2">
                <span className="w-5 h-[5px] rounded-full" style={{ background: l.color }} />
                {l.name}
              </div>
            );
          })}
        </div>
      )}

      {/* Following a train */}
      {follow && (
        <div
          className="absolute -translate-x-1/2 pop-in hud-chip !pl-2 gap-3 max-w-[calc(100vw-24px)] transition-[left,bottom] duration-500 ease-out"
          style={{ bottom: 20 + pad.bottom, left: `calc(${pad.left}px + (100% - ${pad.left + pad.right}px) / 2)` }}
        >
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[13px]" style={{ background: follow.color }} aria-hidden>
            ▶
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-3 leading-none">Following</span>
            <span className="block text-[14px] font-bold text-ink leading-tight mt-0.5 truncate max-w-[14rem]">{follow.title}</span>
          </span>
          <span className="text-[12px] font-semibold text-ink-3 num">{follow.subtitle}</span>
          <button
            type="button"
            onClick={() => engineRef.current?.stopFollowing()}
            className="btn-pop text-[12px] font-bold px-3 py-1.5 rounded-full bg-black/6 hover:bg-black/10 text-ink focus-ring"
          >
            Stop
          </button>
        </div>
      )}

      {/* Camera controls */}
      <div
        className="absolute flex flex-col hud-panel rounded-2xl divide-y divide-black/6 overflow-hidden transition-[right,bottom] duration-500 ease-out"
        style={{ right: 16 + pad.right, bottom: 28 + pad.bottom }}
      >
        <ControlButton label="Zoom in" onClick={() => engineRef.current?.zoomBy(0.6)}><Plus size={17} /></ControlButton>
        <ControlButton label="Zoom out" onClick={() => engineRef.current?.zoomBy(1 / 0.6)}><Minus size={17} /></ControlButton>
        <ControlButton label="Reset view" onClick={() => engineRef.current?.resetView()}><Crosshair size={17} /></ControlButton>
      </div>

      {/* Attribution */}
      <div
        className="absolute px-2 py-1 text-[10px] leading-none text-ink-3 bg-white/70 rounded-md pointer-events-none transition-[right,bottom] duration-500 ease-out"
        style={{ right: 16 + pad.right, bottom: 6 + pad.bottom }}
      >
        {TILE_ATTRIBUTION}
      </div>

      {/* Hover tooltip */}
      {hover && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-xl hud-panel tooltip-pop"
          style={{ left: hover.x + 16, top: hover.y + 16 }}
        >
          <div className="text-[13px] font-bold text-ink leading-tight">{hover.info.title}</div>
          <div className="text-[12px] font-medium text-ink-3 mt-0.5">{hover.info.subtitle}</div>
        </div>
      )}
    </div>
  );
}
