import type { HistoricalBaseline } from "@/types/mbta";

let cache: HistoricalBaseline[] | null = null;

function loadData(): HistoricalBaseline[] {
  if (cache) return cache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cache = require("@/data/gl-historical-baselines.json") as HistoricalBaseline[];
  } catch {
    cache = [];
  }
  return cache!;
}

export function getBaseline(
  stopId: string,
  hour: number,
  dayOfWeek: number,
  directionId: number
): HistoricalBaseline | null {
  const data = loadData();
  return (
    data.find(
      b =>
        b.stopId === stopId &&
        b.hour === hour &&
        b.dayOfWeek === dayOfWeek &&
        b.directionId === directionId
    ) ?? null
  );
}
