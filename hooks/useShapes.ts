import useSWR from "swr";

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function useShapes() {
  const { data, error } = useSWR<Record<string, [number, number][]>>(
    "/api/mbta/shapes",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  );
  return { shapes: data ?? {}, isError: !!error };
}
