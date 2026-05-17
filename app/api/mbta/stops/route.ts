import { NextRequest, NextResponse } from "next/server";
import { getRouteIdsForLine } from "@/lib/lines";
import type { StopListItem } from "@/types/mbta";

const MBTA_BASE = "https://api-v3.mbta.com";
const API_KEY = process.env.MBTA_API_KEY ?? "";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const lineId = req.nextUrl.searchParams.get("route") ?? "Green";
  const format = req.nextUrl.searchParams.get("format") ?? "map";
  const routeIds = getRouteIdsForLine(lineId).join(",");
  const apiHeaders: HeadersInit = API_KEY ? { "x-api-key": API_KEY } : {};

  const params = new URLSearchParams({
    "filter[route]": routeIds,
    "fields[stop]": "name,latitude,longitude,wheelchair_boarding,location_type,parent_station",
  });
  const res = await fetch(`${MBTA_BASE}/stops?${params}`, {
    headers: apiHeaders,
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    return NextResponse.json({ error: `MBTA stops: ${res.status}` }, { status: 502 });
  }
  const data = await res.json();

  const cacheHeaders = { "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600" };

  if (format === "list") {
    const seen = new Set<string>();
    const stops: StopListItem[] = [];
    for (const s of data.data ?? []) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const a = s.attributes;
      stops.push({
        id: s.id,
        name: a.name,
        lat: a.latitude,
        lon: a.longitude,
        accessible: a.wheelchair_boarding === 1,
        locationType: a.location_type ?? 0,
        parentStationId: s.relationships?.parent_station?.data?.id ?? null,
      });
    }
    return NextResponse.json(stops, { headers: cacheHeaders });
  }

  // format=map (default) — used by StopMap
  const stops: Record<string, { lat: number; lon: number }> = {};
  for (const s of data.data ?? []) {
    stops[s.id] = { lat: s.attributes.latitude, lon: s.attributes.longitude };
  }
  return NextResponse.json(stops, { headers: cacheHeaders });
}
