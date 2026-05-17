import { NextRequest, NextResponse } from "next/server";
import { getBaseline } from "@/lib/historical";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const stopId = searchParams.get("stop") ?? "";
  const hour = parseInt(searchParams.get("hour") ?? "8");
  const dow = parseInt(searchParams.get("dow") ?? "1");
  const directionId = parseInt(searchParams.get("dir") ?? "1");

  const baseline = getBaseline(stopId, hour, dow, directionId);

  return NextResponse.json(baseline, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
