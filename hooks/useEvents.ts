import useSWR from "swr";
import type { TransitEvent } from "@/types/mbta";

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useEvents() {
  const { data, error, isLoading } = useSWR<TransitEvent[]>(
    "/api/events",
    fetcher,
    { refreshInterval: 300_000, revalidateOnFocus: false }
  );
  return { events: data ?? [], isLoading, isError: !!error };
}
