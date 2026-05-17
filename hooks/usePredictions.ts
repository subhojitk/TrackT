import useSWR from "swr";
import type { Prediction } from "@/types/mbta";

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function usePredictions(stopId: string, refreshInterval = 30_000) {
  const { data, error, isLoading, mutate } = useSWR<Prediction[]>(
    stopId ? `/api/mbta/predictions?stop=${stopId}` : null,
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
    }
  );

  return {
    predictions: data ?? [],
    isLoading,
    isError: !!error,
    errorMessage: error?.message,
    refresh: mutate,
  };
}
