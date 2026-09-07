import useSWR from "swr";
import type { Prediction } from "@/types/mbta";

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function usePredictions(stopId: string, lineId = "Green", refreshInterval = 30_000) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<Prediction[]>(
    stopId ? `/api/mbta/predictions?stop=${stopId}&route=${lineId}` : null,
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: true,
      dedupingInterval: 10_000,
      keepPreviousData: true,
    }
  );

  return {
    predictions: data ?? [],
    isLoading,
    isValidating,
    isError: !!error,
    errorMessage: error?.message,
    refresh: () => mutate(),
  };
}
