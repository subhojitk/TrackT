"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from "react-leaflet";
import { useRouter } from "next/navigation";
import { GL_STOPS } from "@/lib/stops";
import type { StopInfo } from "@/types/mbta";
import "leaflet/dist/leaflet.css";

const BRANCH_COLORS: Record<string, string> = {
  Trunk:    "#22c55e",
  "B Branch": "#16a34a",
  "C Branch": "#15803d",
  "D Branch": "#4ade80",
  "E Branch": "#86efac",
  GLX:      "#bbf7d0",
};

// Ordered stop IDs per line segment for polylines
const ROUTES: { color: string; ids: string[] }[] = [
  {
    color: "#22c55e",
    ids: ["place-lech","place-spmnl","place-north","place-haecl","place-gover","place-pktrm","place-boyls","place-armnl","place-coecl","place-hymnl","place-kencl"],
  },
  {
    color: "#16a34a",
    ids: ["place-kencl","place-bland","place-buest","place-bucen","place-amory","place-babck","place-brico","place-harvd","place-grigg","place-allsn","place-wrnst","place-wascm","place-sthld","place-chswk","place-chill","place-sougr","place-lake"],
  },
  {
    color: "#15803d",
    ids: ["place-kencl","place-smary","place-hwsst","place-kntst","place-stpul","place-cool","place-sumav","place-bndhl","place-fbkst","place-bcnwa","place-tapst","place-denrd","place-engav","place-clmnl"],
  },
  {
    color: "#4ade80",
    ids: ["place-kencl","place-fenwy","place-longw","place-brkvi","place-brkhl","place-bcnfd","place-rsmnl","place-chhil","place-newto","place-newtn","place-eliot","place-waban","place-woodl","place-river"],
  },
  {
    color: "#86efac",
    ids: ["place-coecl","place-prmnl","place-symcl","place-nuniv","place-mfa","place-lngmd","place-brgfd","place-fenwd","place-mispk","place-rvrwy","place-bckhl","place-hsmnl"],
  },
  {
    color: "#bbf7d0",
    ids: ["place-lech","place-union"],
  },
  {
    color: "#bbf7d0",
    ids: ["place-spmnl","place-esomr","place-gilmn","place-magno","place-ball","place-mdftf"],
  },
];

const stopIndex = Object.fromEntries(GL_STOPS.map(s => [s.id, s]));

interface Props {
  currentStopId?: string;
  fillContainer?: boolean;
}

export default function StopMap({ currentStopId, fillContainer }: Props) {
  const router = useRouter();

  // Fix Leaflet default icon in webpack/turbopack
  useEffect(() => {
    // no-op: we use CircleMarker so no icon fix needed
  }, []);

  const center: [number, number] = currentStopId && stopIndex[currentStopId]
    ? [stopIndex[currentStopId].lat, stopIndex[currentStopId].lon]
    : [42.356, -71.1];

  return (
    <MapContainer
      center={center}
      zoom={currentStopId ? 14 : 12}
      className={fillContainer ? "w-full h-full" : "w-full h-64 rounded-lg overflow-hidden"}
      style={{ background: "#18181b" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />

      {/* Branch lines */}
      {ROUTES.map((route, i) => {
        const positions = route.ids
          .map(id => stopIndex[id])
          .filter(Boolean)
          .map((s): [number, number] => [s.lat, s.lon]);
        return (
          <Polyline
            key={i}
            positions={positions}
            pathOptions={{ color: route.color, weight: 3, opacity: 0.7 }}
          />
        );
      })}

      {/* Stop markers */}
      {GL_STOPS.map(stop => {
        const isCurrent = stop.id === currentStopId;
        const color = BRANCH_COLORS[stop.section] ?? "#22c55e";
        return (
          <CircleMarker
            key={stop.id}
            center={[stop.lat, stop.lon]}
            radius={isCurrent ? 9 : 5}
            pathOptions={{
              color: isCurrent ? "#fff" : color,
              fillColor: isCurrent ? color : color,
              fillOpacity: isCurrent ? 1 : 0.7,
              weight: isCurrent ? 2 : 1,
            }}
            eventHandlers={{
              click: () => router.push(`/stop/${stop.id}`),
            }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
              <span className="text-xs font-medium">{stop.name}</span>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
