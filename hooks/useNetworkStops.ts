import { useMemo } from "react";
import useSWR from "swr";
import type { StopListItem } from "@/types/mbta";
import { getLine } from "@/lib/lines";

/** Rapid-transit lines whose stations are drawn on the overview map and searchable. */
export const NETWORK_LINES = ["Red", "Orange", "Blue", "Green", "Mattapan"] as const;

export interface NetworkStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  accessible: boolean;
  /** Every requested line serving this station, in request order. */
  lines: string[];
}

async function fetchLines(lineIds: readonly string[]): Promise<{ lineId: string; stops: StopListItem[] }[]> {
  return Promise.all(lineIds.map(async lineId => {
    const r = await fetch(`/api/mbta/stops?route=${lineId}&format=list`);
    if (!r.ok) throw new Error(`${r.status}`);
    return { lineId, stops: (await r.json()) as StopListItem[] };
  }));
}

const NO_LINES: readonly string[] = [];

/**
 * Stations served by any of `lineIds`, deduplicated across lines (Park St is
 * Red + Green); each lists every requested line that serves it.
 */
export function useStations(lineIds: readonly string[] = NO_LINES): { stations: NetworkStation[]; isLoading: boolean } {
  const { data, isLoading } = useSWR(
    lineIds.length ? ["stations", ...lineIds] : null,
    ([, ...ids]: string[]) => fetchLines(ids),
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  );
  const stations = useMemo(() => {
    const byId = new Map<string, NetworkStation>();
    for (const { lineId, stops } of data ?? []) {
      for (const s of stops) {
        const isStation = s.locationType === 1 || (s.locationType === 0 && !s.parentStationId);
        if (!isStation) continue;
        const existing = byId.get(s.id);
        if (existing) {
          if (!existing.lines.includes(lineId)) existing.lines.push(lineId);
        } else {
          byId.set(s.id, { id: s.id, name: s.name, lat: s.lat, lon: s.lon, accessible: s.accessible, lines: [lineId] });
        }
      }
    }
    return [...byId.values()];
  }, [data]);
  return { stations, isLoading };
}

/** Every subway station — the searchable network. */
export function useNetworkStops() {
  return useStations(NETWORK_LINES);
}

export function lineColor(lineId: string): string {
  return getLine(lineId)?.color ?? "#8b8b94";
}
