"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import type { StopListItem } from "@/types/mbta";
import { getLine } from "@/lib/lines";

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Props {
  lineId: string;
}

export default function StopPicker({ lineId }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const line = getLine(lineId);

  const { data: stops, isLoading } = useSWR<StopListItem[]>(
    `/api/mbta/stops?route=${lineId}&format=list`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  );

  const filtered = (stops ?? []).filter(s =>
    // Show parent stations (locationType 1) or standalone stops (locationType 0 with no parent)
    (s.locationType === 1 || (s.locationType === 0 && !s.parentStationId)) &&
    (query === "" || s.name.toLowerCase().includes(query.toLowerCase()))
  );

  const seen = new Set<string>();
  const deduped = filtered.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  return (
    <div className="w-full">
      <h2 className="text-[11px] font-bold tracking-[0.2em] text-zinc-500 mb-4">SELECT STOP</h2>

      <input
        type="text"
        placeholder="Search stops…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 mb-3"
      />

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 bg-zinc-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && deduped.length === 0 && (
        <div className="text-center text-zinc-600 text-sm py-8 tracking-widest">
          {query ? "NO STOPS MATCH" : "NO STOPS FOUND"}
        </div>
      )}

      <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
        {deduped.map(stop => (
          <button
            key={stop.id}
            onClick={() => router.push(`/stop/${lineId}/${stop.id}`)}
            className="group flex items-center gap-3 px-4 py-3 rounded-lg border border-zinc-800 hover:border-zinc-600 bg-zinc-900/40 hover:bg-zinc-900/80 transition-all text-left cursor-pointer"
          >
            <span
              className="shrink-0 w-2 h-2 rounded-full"
              style={{ backgroundColor: line?.color ?? "#22c55e" }}
            />
            <span className="flex-1 text-sm text-zinc-200 group-hover:text-zinc-100">{stop.name}</span>
            {stop.accessible && (
              <span className="text-[10px] text-zinc-600" title="Accessible">♿</span>
            )}
            <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors text-sm">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
