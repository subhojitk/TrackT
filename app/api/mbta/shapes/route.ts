import { NextRequest, NextResponse } from "next/server";
import { getRouteIdsForLine } from "@/lib/lines";

const MBTA_BASE = "https://api-v3.mbta.com";
const API_KEY = process.env.MBTA_API_KEY ?? "";

export const runtime = "nodejs";

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b: number, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : (result >> 1);
    shift = result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : (result >> 1);
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

export async function GET(req: NextRequest) {
  const lineId = req.nextUrl.searchParams.get("route") ?? "Green";
  const routeIds = getRouteIdsForLine(lineId);
  const headers: HeadersInit = API_KEY ? { "x-api-key": API_KEY } : {};
  const result: Record<string, [number, number][]> = {};

  await Promise.all(routeIds.map(async route => {
    const params = new URLSearchParams({
      "filter[route]": route,
      "fields[shape]": "polyline",
    });
    const res = await fetch(`${MBTA_BASE}/shapes?${params}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return;
    const data = await res.json();

    const byDir: Record<number, { len: number; points: [number, number][] }> = {};
    for (const shape of data.data ?? []) {
      const encoded: string = shape.attributes?.polyline;
      if (!encoded) continue;
      const dirMatch = shape.id?.match(/-(\d)-\d+$/);
      const dir = dirMatch ? parseInt(dirMatch[1]) : 0;
      if (!byDir[dir] || encoded.length > byDir[dir].len) {
        byDir[dir] = { len: encoded.length, points: decodePolyline(encoded) };
      }
    }
    const canonical = byDir[0] ?? byDir[1];
    if (canonical) result[route] = canonical.points;
  }));

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600" },
  });
}
