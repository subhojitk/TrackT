"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { StopListItem } from "@/types/mbta";
import { getLine } from "@/lib/lines";
import { Accessible, ChevronRight, Search } from "./icons";
import { EmptyState, Skeleton } from "./ui";
import { getEngine, originFromEvent } from "@/lib/mapBus";

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

interface Props {
  lineId: string;
}

export default function StopPicker({ lineId }: Props) {
  const [query, setQuery] = useState("");
  const line = getLine(lineId);

  const { data: stops, isLoading, error } = useSWR<StopListItem[]>(
    `/api/mbta/stops?route=${lineId}&format=list`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  );

  // Parent stations (locationType 1) or standalone stops with no parent
  const stations = useMemo(() => {
    const seen = new Set<string>();
    return (stops ?? []).filter(s => {
      const isStation = s.locationType === 1 || (s.locationType === 0 && !s.parentStationId);
      if (!isStation || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }, [stops]);

  const q = query.trim().toLowerCase();
  const filtered = q ? stations.filter(s => s.name.toLowerCase().includes(q)) : stations;

  return (
    <div>
      <label className="relative block mb-3">
        <span className="sr-only">Search stops</span>
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3 pointer-events-none" />
        <input
          type="search"
          placeholder="Filter stops on this line…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoComplete="off"
          className="w-full h-11 bg-white border-[1.5px] border-line rounded-2xl pl-10 pr-4 text-[14px] font-semibold text-ink placeholder:text-ink-3 placeholder:font-medium focus:outline-none focus:border-line-strong focus:ring-4 focus:ring-[color:var(--accent)]/25 transition"
        />
      </label>

      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[12px] font-semibold text-ink-3">
          {isLoading ? "Loading stops…" : `${filtered.length} ${filtered.length === 1 ? "stop" : "stops"}${q ? " match" : ""}`}
        </span>
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-3">
          <Accessible size={13} /> Accessible
        </span>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[50px] rounded-[20px]" />)}
        </div>
      )}

      {!isLoading && error && (
        <EmptyState className="card">Couldn&apos;t load stops for this line. Check your connection and try again.</EmptyState>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <EmptyState className="card">{q ? `No stops match “${query}”.` : "No stops found for this line."}</EmptyState>
      )}

      {!isLoading && filtered.length > 0 && (
        <ul className="flex flex-col gap-1.5" role="list">
          {filtered.map((stop, i) => (
            <li key={stop.id}>
              <Link
                href={`/stop/${lineId}/${stop.id}`}
                onClick={e => {
                  originFromEvent(e);
                  getEngine()?.flyTo(stop.lat, stop.lon, 110);
                }}
                className="group card card-fluid stagger flex items-center gap-3.5 px-4 py-3 hover:border-line-strong focus-ring"
                style={{ "--stagger-i": Math.min(i, 14) } as CSSProperties}
              >
                <span className="relative flex items-center justify-center w-4 h-4 shrink-0">
                  <span className="absolute inset-0 rounded-full transition-transform duration-300 group-hover:scale-125" style={{ background: line?.color ?? "#22c55e" }} />
                  <span className="relative w-2 h-2 rounded-full bg-white" />
                </span>
                <span className="flex-1 text-[14px] font-bold text-ink-2 group-hover:text-ink truncate">{stop.name}</span>
                {stop.accessible && <Accessible size={14} className="text-ink-3 shrink-0" aria-label="Accessible" />}
                <ChevronRight size={16} className="text-ink-3/60 group-hover:text-ink-2 transition-colors shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
