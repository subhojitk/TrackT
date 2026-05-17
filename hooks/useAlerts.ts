import useSWR from "swr";
import type { Alert } from "@/types/mbta";

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function useAlerts(stopId: string, lineId = "Green") {
  const { data, error, isLoading } = useSWR<Alert[]>(
    stopId ? `/api/mbta/alerts?stop=${stopId}&route=${lineId}` : null,
    fetcher,
    {
      refreshInterval: 60_000,
      dedupingInterval: 30_000,
    }
  );

  return {
    alerts: data ?? [],
    isLoading,
    isError: !!error,
  };
}
