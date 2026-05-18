import useSWR from "swr";

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function useStopPositions(lineId?: string) {
  const { data } = useSWR<Record<string, { lat: number; lon: number }>>(
    lineId ? `/api/mbta/stops?route=${lineId}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  );
  return data ?? {};
}
