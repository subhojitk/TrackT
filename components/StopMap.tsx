"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GL_STOPS } from "@/lib/stops";
import { useVehicles } from "@/hooks/useVehicles";
import { useShapes } from "@/hooks/useShapes";
import { useStopPositions } from "@/hooks/useStopPositions";

const BRANCH_COLORS: Record<string, string> = {
  Trunk:      "#22c55e",
  "B Branch": "#16a34a",
  "C Branch": "#15803d",
  "D Branch": "#4ade80",
  "E Branch": "#86efac",
  GLX:        "#bbf7d0",
};

const VEHICLE_COLORS: Record<string, string> = {
  B: "#4ade80",
  C: "#86efac",
  D: "#34d399",
  E: "#6ee7b7",
  GL: "#22c55e",
};

const ROUTE_COLORS: Record<string, string> = {
  "Green-B": "#16a34a",
  "Green-C": "#15803d",
  "Green-D": "#4ade80",
  "Green-E": "#86efac",
};

const stopIndex = Object.fromEntries(GL_STOPS.map(s => [s.id, s]));

interface Props {
  currentStopId?: string;
  fillContainer?: boolean;
}

export default function StopMap({ currentStopId, fillContainer }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const vehicleLayerRef = useRef<L.LayerGroup | null>(null);
  const shapeLayerRef = useRef<L.LayerGroup | null>(null);
  const stopLayerRef = useRef<L.LayerGroup | null>(null);
  const router = useRouter();
  const { vehicles } = useVehicles();
  const { shapes } = useShapes();
  const stopPositions = useStopPositions();

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = currentStopId && stopIndex[currentStopId]
      ? [stopIndex[currentStopId].lat, stopIndex[currentStopId].lon]
      : [42.356, -71.1];

    const map = L.map(containerRef.current, {
      center,
      zoom: currentStopId ? 14 : 12,
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
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw stop markers when positions or currentStopId changes
  useEffect(() => {
    const layer = stopLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const stop of GL_STOPS) {
      const pos = stopPositions[stop.id];
      const lat = pos?.lat ?? stop.lat;
      const lon = pos?.lon ?? stop.lon;
      const isCurrent = stop.id === currentStopId;
      const color = BRANCH_COLORS[stop.section] ?? "#22c55e";
      const circle = L.circleMarker([lat, lon], {
        radius: isCurrent ? 9 : 5,
        color: isCurrent ? "#fff" : color,
        fillColor: color,
        fillOpacity: isCurrent ? 1 : 0.7,
        weight: isCurrent ? 2 : 1,
      }).addTo(layer);
      circle.bindTooltip(stop.name, { direction: "top", offset: [0, -6], opacity: 0.95 });
      circle.on("click", () => router.push(`/stop/${stop.id}`));
    }
  }, [currentStopId, router, stopPositions]);

  // Recenter when currentStopId changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !currentStopId) return;
    const pos = stopPositions[currentStopId] ?? stopIndex[currentStopId];
    if (!pos) return;
    map.setView([pos.lat, pos.lon], 14, { animate: true });
  }, [currentStopId, stopPositions]);

  // Draw route shapes
  useEffect(() => {
    const layer = shapeLayerRef.current;
    if (!layer || Object.keys(shapes).length === 0) return;
    layer.clearLayers();
    for (const [routeId, points] of Object.entries(shapes)) {
      L.polyline(points, {
        color: ROUTE_COLORS[routeId] ?? "#22c55e",
        weight: 3,
        opacity: 0.75,
      }).addTo(layer);
    }
  }, [shapes]);

  // Update live train markers
  useEffect(() => {
    const layer = vehicleLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const v of vehicles) {
      const color = VEHICLE_COLORS[v.branch] ?? "#22c55e";
      const stopped = v.status === "STOPPED_AT";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="9" fill="${color}" fill-opacity="${stopped ? 0.5 : 0.9}" stroke="#000" stroke-width="1.5"/>
        <polygon points="10,2 14,14 10,11 6,14" fill="white" fill-opacity="0.9"
          transform="rotate(${v.bearing}, 10, 10)"/>
      </svg>`;
      const icon = L.divIcon({ html: svg, className: "", iconSize: [20, 20], iconAnchor: [10, 10] });
      const marker = L.marker([v.lat, v.lon], { icon, zIndexOffset: 1000 }).addTo(layer);
      const speedStr = v.speed !== null ? ` · ${Math.round(v.speed)} mph` : "";
      marker.bindTooltip(
        `<div style="font-size:12px;line-height:1.4">
          <strong>${v.branch} · ${v.headsign}</strong><br/>
          <span style="color:#71717a">${stopped ? "⏹ Stopped" : "▶ Moving"}${speedStr}</span>
        </div>`,
        { direction: "top", offset: [0, -10], opacity: 0.97 }
      );
    }
  }, [vehicles]);

  return (
    <div
      ref={containerRef}
      className={fillContainer ? "absolute inset-0" : "w-full h-64 rounded-lg overflow-hidden"}
      style={{ background: "#18181b" }}
    />
  );
}
