"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Map as LeafletMap, LayerGroup, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useVehicles } from "@/hooks/useVehicles";
import { useShapes } from "@/hooks/useShapes";
import { useStopPositions } from "@/hooks/useStopPositions";
import { getLine } from "@/lib/lines";

// Colors for each line in overview mode
const OVERVIEW_LINE_COLORS: Record<string, string> = {
  Red:      "#DA291C",
  Orange:   "#ED8B00",
  Blue:     "#003DA5",
  Green:    "#00843D",
  Mattapan: "#80276C",
};

interface Props {
  currentStopId?: string;
  fillContainer?: boolean;
  lineId?: string; // undefined or "overview" = ghosted all-lines view
}

export default function StopMap({ currentStopId, fillContainer, lineId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const vehicleLayerRef = useRef<LayerGroup | null>(null);
  const shapeLayerRef = useRef<LayerGroup | null>(null);
  const stopLayerRef = useRef<LayerGroup | null>(null);
  const vehicleMarkersRef = useRef(new globalThis.Map<string, Marker>());
  const router = useRouter();

  const isOverview = !lineId || lineId === "overview";
  const shapesKey = isOverview ? "overview" : lineId;
  const vehiclesKey = isOverview ? null : lineId;

  const { vehicles } = useVehicles(vehiclesKey ?? "Green", 10_000);
  const { shapes } = useShapes(shapesKey);
  const stopPositions = useStopPositions(isOverview ? undefined : lineId);

  const line = lineId ? getLine(lineId) : null;
  const lineColor = line?.color ?? "#22c55e";

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const L = require("leaflet") as typeof import("leaflet");

    // Overview: Boston Common center; line-specific: use line's center
    const defaultCenter: [number, number] = isOverview
      ? [42.3601, -71.0589]
      : (line?.mapCenter ?? [42.356, -71.1]);
    const defaultZoom = isOverview ? 12 : (line?.mapZoom ?? 12);

    const map = L.map(containerRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: true,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    }).addTo(map);

    shapeLayerRef.current = L.layerGroup().addTo(map);
    stopLayerRef.current = L.layerGroup().addTo(map);
    vehicleLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      vehicleLayerRef.current = null;
      shapeLayerRef.current = null;
      stopLayerRef.current = null;
      vehicleMarkersRef.current.clear();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw stop markers (skipped in overview mode)
  useEffect(() => {
    const layer = stopLayerRef.current;
    if (!layer) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const L = require("leaflet") as typeof import("leaflet");
    layer.clearLayers();
    if (isOverview) return; // no stops in overview
    for (const [stopId, pos] of Object.entries(stopPositions)) {
      const isCurrent = stopId === currentStopId;
      const circle = L.circleMarker([pos.lat, pos.lon], {
        radius: isCurrent ? 9 : 5,
        color: isCurrent ? "#fff" : lineColor,
        fillColor: lineColor,
        fillOpacity: isCurrent ? 1 : 0.7,
        weight: isCurrent ? 2 : 1,
      }).addTo(layer);
      circle.on("click", () => router.push(`/stop/${lineId}/${stopId}`));
    }
  }, [currentStopId, router, stopPositions, lineId, lineColor, isOverview]);

  // Recenter when currentStopId changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !currentStopId || isOverview) return;
    const pos = stopPositions[currentStopId];
    if (!pos) return;
    map.setView([pos.lat, pos.lon], 14, { animate: true });
  }, [currentStopId, stopPositions, isOverview]);

  // Draw route shapes
  useEffect(() => {
    const layer = shapeLayerRef.current;
    if (!layer || Object.keys(shapes).length === 0) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const L = require("leaflet") as typeof import("leaflet");
    layer.clearLayers();
    for (const [routeKey, points] of Object.entries(shapes)) {
      const color = isOverview
        ? (OVERVIEW_LINE_COLORS[routeKey] ?? "#ffffff")
        : lineColor;
      const opacity = isOverview ? 0.12 : 0.75;
      const weight = isOverview ? 3 : 3;
      L.polyline(points, { color, weight, opacity }).addTo(layer);
    }
  }, [shapes, lineColor, isOverview]);

  // Incremental vehicle marker updates (skipped in overview mode)
  useEffect(() => {
    const layer = vehicleLayerRef.current;
    if (!layer) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const L = require("leaflet") as typeof import("leaflet");
    const markerMap = vehicleMarkersRef.current;

    if (isOverview || vehiclesKey === null) {
      // Clear all markers in overview
      for (const marker of markerMap.values()) layer.removeLayer(marker);
      markerMap.clear();
      return;
    }

    const currentIds = new Set(vehicles.map(v => v.id));
    for (const [id, marker] of markerMap.entries()) {
      if (!currentIds.has(id)) { layer.removeLayer(marker); markerMap.delete(id); }
    }
    for (const v of vehicles) {
      const stopped = v.status === "STOPPED_AT";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="9" fill="${lineColor}" fill-opacity="${stopped ? 0.5 : 0.9}" stroke="#000" stroke-width="1.5"/>
        <polygon points="10,2 14,14 10,11 6,14" fill="white" fill-opacity="0.9"
          transform="rotate(${v.bearing}, 10, 10)"/>
      </svg>`;
      const icon = L.divIcon({ html: svg, className: "", iconSize: [20, 20], iconAnchor: [10, 10] });
      const speedStr = v.speed !== null ? ` · ${Math.round(v.speed)} mph` : "";
      const tooltip = `<div style="font-size:12px;line-height:1.4">
        <strong>${v.branch} · ${v.headsign}</strong><br/>
        <span style="color:#71717a">${stopped ? "⏹ Stopped" : "▶ Moving"}${speedStr}</span>
      </div>`;
      const existing = markerMap.get(v.id);
      if (existing) {
        existing.setLatLng([v.lat, v.lon]);
        existing.setIcon(icon);
        existing.unbindTooltip();
        existing.bindTooltip(tooltip, { direction: "top", offset: [0, -10], opacity: 0.97 });
      } else {
        const marker = L.marker([v.lat, v.lon], { icon, zIndexOffset: 1000 }).addTo(layer);
        marker.bindTooltip(tooltip, { direction: "top", offset: [0, -10], opacity: 0.97 });
        markerMap.set(v.id, marker);
      }
    }
  }, [vehicles, lineColor, isOverview, vehiclesKey]);

  return (
    <div
      ref={containerRef}
      className={fillContainer ? "absolute inset-0" : "w-full h-64 rounded-lg overflow-hidden"}
      style={{ background: "#18181b" }}
    />
  );
}
