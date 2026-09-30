import useSWR from "swr";

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

const EMPTY: Record<string, [number, number][]> = {};

/** Route shapes for a map data key (line id or "mode:<mode>"); null skips fetching. */
export function useShapes(key: string | null = "Green") {
  const { data, error } = useSWR<Record<string, [number, number][]>>(
    key ? `/api/mbta/shapes?route=${encodeURIComponent(key)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  );
  return { shapes: data ?? EMPTY, isLoaded: !!data || !key, isError: !!error };
}
