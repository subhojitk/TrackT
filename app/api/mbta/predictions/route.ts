import { NextRequest, NextResponse } from "next/server";
import { fetchPredictions } from "@/lib/mbta-api";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const stopId = req.nextUrl.searchParams.get("stop");
  if (!stopId) {
    return NextResponse.json({ error: "stop param required" }, { status: 400 });
  }
  try {
    const predictions = await fetchPredictions(stopId);
    return NextResponse.json(predictions, {
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e: any) {
    console.error("[predictions]", e);
    return NextResponse.json({ error: e.message, cause: e.cause?.message }, { status: 502 });
  }
}
