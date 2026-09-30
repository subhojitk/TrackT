"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getLine } from "@/lib/lines";
import StopMap from "./StopMapDynamic";

/** Derive what the map should show from the URL, so every page drives it. */
function MapFromUrl() {
  const pathname = usePathname() ?? "/";
  const params = useSearchParams();

  let lineId: string | undefined;
  let stopId: string | undefined;
  const m = pathname.match(/^\/stop\/([^/]+)\/([^/]+)/);
  if (m) {
    lineId = decodeURIComponent(m[1]);
    stopId = decodeURIComponent(m[2]);
  } else if (pathname === "/") {
    lineId = params?.get("line") ?? undefined;
  }
  if (lineId && !getLine(lineId)) lineId = undefined;

  return <StopMap lineId={lineId} currentStopId={stopId} />;
}

/**
 * The fullscreen 3D map. Mounted once in the root layout so it survives
 * navigation — pages only float windows over it.
 */
export default function MapStage() {
  return (
    <div className="fixed inset-0 z-0">
      <Suspense fallback={<div className="absolute inset-0 sky-bg" />}>
        <MapFromUrl />
      </Suspense>
    </div>
  );
}
