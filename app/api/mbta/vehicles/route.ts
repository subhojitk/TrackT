import { NextRequest, NextResponse } from "next/server";
import type { Vehicle } from "@/types/mbta";
import { lineForRoute, routeIdsForKey } from "@/lib/lines";
import { relId, str, num, type Document, type Resource } from "@/lib/jsonapi";

const MBTA_BASE = "https://api-v3.mbta.com";
const API_KEY = process.env.MBTA_API_KEY ?? "";

export const runtime = "nodejs";


const STATUSES = new Set<Vehicle["status"]>(["IN_TRANSIT_TO", "STOPPED_AT", "INCOMING_AT"]);

export async function GET(req: NextRequest) {
  const lineId = req.nextUrl.searchParams.get("route") ?? "Green";
  const routeIds = routeIdsForKey(lineId).join(",");
  const params = new URLSearchParams({
    "filter[route]": routeIds,
    "include": "trip",
  });

  let res: Response;
  try {
    res = await fetch(`${MBTA_BASE}/vehicles?${params}`, {
      headers: API_KEY ? { "x-api-key": API_KEY } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return NextResponse.json({ error: "MBTA vehicles: unreachable" }, { status: 502 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: `MBTA vehicles: ${res.status}` }, { status: 502 });
  }

  const data: Document = await res.json();
  const tripIndex = new Map<string, Resource>();
  for (const item of data.included ?? []) {
    if (item.type === "trip") tripIndex.set(item.id, item);
  }

  const vehicles: Vehicle[] = [];
  for (const v of data.data ?? []) {
    const a = v.attributes;
    const lat = num(a.latitude), lon = num(a.longitude);
    if (lat === null || lon === null) continue;
    const route = relId(v, "route") ?? "";
    const tripId = relId(v, "trip");
    const trip = tripId ? tripIndex.get(tripId) : undefined;
    const rawStatus = str(a.current_status);
    vehicles.push({
      id: v.id,
      lat,
      lon,
      bearing: num(a.bearing) ?? 0,
      speed: num(a.speed),
      status: rawStatus && STATUSES.has(rawStatus as Vehicle["status"]) ? (rawStatus as Vehicle["status"]) : "IN_TRANSIT_TO",
      directionId: (num(a.direction_id) ?? 0) as 0 | 1,
      route,
      // Green branches keep their letter; everything else shows the line's short name
      branch: route.startsWith("Green-") ? route.slice(6) : lineForRoute(route)?.shortName ?? route,
      headsign: str(trip?.attributes.headsign) ?? route,
      currentStopId: relId(v, "stop"),
      updatedAt: str(a.updated_at),
    });
  }

  return NextResponse.json(vehicles, {
    headers: { "Cache-Control": "no-store" },
  });
}
