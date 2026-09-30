import { NextRequest, NextResponse } from "next/server";
import { routeIdsForKey } from "@/lib/lines";

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
  // a line id, or a whole mode ("mode:bus"); keyed by route id so vehicles snap to their own track
  const routeIds = routeIdsForKey(lineId);
  const headers: HeadersInit = API_KEY ? { "x-api-key": API_KEY } : {};
  const result: Record<string, [number, number][]> = {};

  await Promise.all(routeIds.map(async route => {
    const params = new URLSearchParams({
      "filter[route]": route,
      "fields[shape]": "polyline",
    });
    const res = await fetch(`${MBTA_BASE}/shapes?${params}`, {
      headers,
      next: { revalidate: 86400 }, // shapes change a few times a year
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return;
    const data = await res.json();

    // Canonical shapes: one per branch pattern (e.g. Red → Ashmont and Braintree),
    // each in both directions. Keep one per branch; extra branches get "~n" keys
    // so vehicles on either branch have a track to ride.
    const branches = new Map<string, string>();
    for (const shape of data.data ?? []) {
      const id: string = shape.id ?? "";
      const encoded: string = shape.attributes?.polyline;
      if (!id.startsWith("canonical-") || !encoded) continue;
      const branch = id.slice("canonical-".length).split("_")[0];
      const prev = branches.get(branch);
      if (!prev || encoded.length > prev.length) branches.set(branch, encoded);
    }
    if (branches.size > 0) {
      // Some routes publish near-identical variants; drop ones sharing both termini
      const near = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 0.003;
      const kept: [number, number][][] = [];
      for (const encoded of [...branches.values()].sort((a, b) => b.length - a.length)) {
        const pts = decodePolyline(encoded);
        if (pts.length < 2) continue;
        const [a0, a1] = [pts[0], pts[pts.length - 1]];
        const dup = kept.some(k => {
          const [b0, b1] = [k[0], k[k.length - 1]];
          return (near(a0, b0) && near(a1, b1)) || (near(a0, b1) && near(a1, b0));
        });
        if (!dup) kept.push(pts);
      }
      kept.forEach((pts, i) => { result[i === 0 ? route : `${route}~${i}`] = pts; });
      return;
    }

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
