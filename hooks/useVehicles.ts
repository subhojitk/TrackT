import useSWR from "swr";
import type { Vehicle } from "@/types/mbta";

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

const EMPTY: Vehicle[] = [];

/** Live vehicles for a map data key (line id or "mode:<mode>"); null shows none. */
export function useVehicles(key: string | null = "Green", refreshInterval = 10_000) {
  const { data, error, isLoading } = useSWR<Vehicle[]>(
    key ? `/api/mbta/vehicles?route=${encodeURIComponent(key)}` : null,
    fetcher,
    { refreshInterval, dedupingInterval: 8_000, revalidateOnFocus: false }
  );
  return { vehicles: data ?? EMPTY, isLoading, isError: !!error };
}
