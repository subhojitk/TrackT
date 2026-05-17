import { NextRequest, NextResponse } from "next/server";
import { fetchAlerts } from "@/lib/mbta-api";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const stopId = req.nextUrl.searchParams.get("stop");
  if (!stopId) {
    return NextResponse.json({ error: "stop param required" }, { status: 400 });
  }
  try {
    const alerts = await fetchAlerts(stopId);
    return NextResponse.json(alerts, {
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
