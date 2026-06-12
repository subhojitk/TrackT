import { NextRequest, NextResponse } from "next/server";
import type { Vehicle } from "@/types/mbta";
import { getRouteIdsForLine } from "@/lib/lines";

const MBTA_BASE = "https://api-v3.mbta.com";
const API_KEY = process.env.MBTA_API_KEY ?? "";

export const runtime = "nodejs";

// Overview mode streams every subway vehicle for the landing map
const OVERVIEW_ROUTES = ["Red", "Orange", "Blue", "Green-B", "Green-C", "Green-D", "Green-E", "Mattapan"];

export async function GET(req: NextRequest) {
  const lineId = req.nextUrl.searchParams.get("route") ?? "Green";
  const routeIds = (lineId === "overview" ? OVERVIEW_ROUTES : getRouteIdsForLine(lineId)).join(",");
  const params = new URLSearchParams({
    "filter[route]": routeIds,
    "include": "trip",
  });
  const res = await fetch(`${MBTA_BASE}/vehicles?${params}`, {
    headers: API_KEY ? { "x-api-key": API_KEY } : {},
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json({ error: `MBTA vehicles: ${res.status}` }, { status: 502 });
  }

  const data = await res.json();
  const tripIndex: Record<string, any> = {};
  for (const item of data.included ?? []) {
    if (item.type === "trip") tripIndex[item.id] = item;
  }

  const vehicles: Vehicle[] = (data.data ?? [])
    .filter((v: any) => v.attributes.latitude && v.attributes.longitude)
    .map((v: any) => {
      const a = v.attributes;
      const route: string = v.relationships?.route?.data?.id ?? "";
      const tripId = v.relationships?.trip?.data?.id;
      const trip = tripId ? tripIndex[tripId] : null;
      return {
        id: v.id,
        lat: a.latitude,
        lon: a.longitude,
        bearing: a.bearing ?? 0,
        speed: a.speed ?? null,
        status: a.current_status ?? "IN_TRANSIT_TO",
        directionId: a.direction_id,
        route,
        branch: route.replace("Green-", "") || "GL",
        headsign: trip?.attributes?.headsign ?? route,
        currentStopId: v.relationships?.stop?.data?.id ?? null,
        updatedAt: a.updated_at ?? null,
      } satisfies Vehicle;
    });

  return NextResponse.json(vehicles, {
    headers: { "Cache-Control": "no-store" },
  });
}
