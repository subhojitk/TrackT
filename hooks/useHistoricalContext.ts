import useSWR from "swr";
import type { HistoricalBaseline } from "@/types/mbta";

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function useHistoricalContext(stopId: string, direction: "all" | "0" | "1") {
  const now = new Date();
  const hour = now.getHours();
  const dow = now.getDay();
  const dirId = direction === "all" ? 1 : parseInt(direction);

  const { data } = useSWR<HistoricalBaseline | null>(
    stopId
      ? `/api/mbta/historical?stop=${stopId}&hour=${hour}&dow=${dow}&dir=${dirId}`
      : null,
    fetcher,
    { refreshInterval: 3_600_000 }
  );

  return data ?? null;
}
