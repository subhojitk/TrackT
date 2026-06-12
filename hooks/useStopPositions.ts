import { useMemo } from "react";
import useSWR from "swr";
import type { StopListItem } from "@/types/mbta";

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export interface StopPosition {
  lat: number;
  lon: number;
  name: string;
  /** Parent station or standalone stop — the ones worth drawing on the map. */
  isStation: boolean;
}

export function useStopPositions(lineId?: string): Record<string, StopPosition> {
  const { data } = useSWR<StopListItem[]>(
    lineId ? `/api/mbta/stops?route=${lineId}&format=list` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  );
  return useMemo(() => {
    const out: Record<string, StopPosition> = {};
    for (const s of data ?? []) {
      out[s.id] = {
        lat: s.lat,
        lon: s.lon,
        name: s.name,
        isStation: s.locationType === 1 || (s.locationType === 0 && !s.parentStationId),
      };
    }
    return out;
  }, [data]);
}
