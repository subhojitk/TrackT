import useSWR from "swr";
import type { Vehicle } from "@/types/mbta";

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function useVehicles(lineId = "Green", refreshInterval = 10_000) {
  const { data, error, isLoading } = useSWR<Vehicle[]>(
    `/api/mbta/vehicles?route=${lineId}`,
    fetcher,
    { refreshInterval, dedupingInterval: 8_000, revalidateOnFocus: false }
  );
  return { vehicles: data ?? [], isLoading, isError: !!error };
}
