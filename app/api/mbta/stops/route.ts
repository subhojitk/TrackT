import { NextResponse } from "next/server";

const MBTA_BASE = "https://api-v3.mbta.com";
const GL_ROUTES = "Green-B,Green-C,Green-D,Green-E";
const API_KEY = process.env.MBTA_API_KEY ?? "";

export const runtime = "nodejs";

export async function GET() {
  const params = new URLSearchParams({
    "filter[route]": GL_ROUTES,
    "fields[stop]": "id,name,latitude,longitude",
  });
  const res = await fetch(`${MBTA_BASE}/stops?${params}`, {
    headers: API_KEY ? { "x-api-key": API_KEY } : {},
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    return NextResponse.json({ error: `MBTA stops: ${res.status}` }, { status: 502 });
  }
  const data = await res.json();
  const stops: Record<string, { lat: number; lon: number }> = {};
  for (const s of data.data ?? []) {
    stops[s.id] = { lat: s.attributes.latitude, lon: s.attributes.longitude };
  }
  return NextResponse.json(stops, {
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600" },
  });
}
