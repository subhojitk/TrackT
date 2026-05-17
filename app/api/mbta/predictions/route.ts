import { NextRequest, NextResponse } from "next/server";
import { fetchPredictions } from "@/lib/mbta-api";
import { getRouteIdsForLine } from "@/lib/lines";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const stopId = req.nextUrl.searchParams.get("stop");
  const lineId = req.nextUrl.searchParams.get("route") ?? "Green";
  if (!stopId) {
    return NextResponse.json({ error: "stop param required" }, { status: 400 });
  }
  try {
    const routes = getRouteIdsForLine(lineId);
    const predictions = await fetchPredictions(stopId, routes);
    return NextResponse.json(predictions, {
      headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e: any) {
    console.error("[predictions]", e);
    return NextResponse.json({ error: e.message, cause: e.cause?.message }, { status: 502 });
  }
}
