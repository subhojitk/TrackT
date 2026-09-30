"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNetworkStops } from "@/hooks/useNetworkStops";
import { getLine, isGreenBranch, LINES, MODE_LABELS, type Line } from "@/lib/lines";
import { getEngine, setOrigin } from "@/lib/mapBus";
import { Accessible, MapPin, Search, X } from "./icons";
import { LineBadge } from "./ui";

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="18" fill="#1d2433" />
      <path d="M13 46 L29 30 L51 30" fill="none" stroke="#FFC72C" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13" cy="46" r="5" fill="#ED8B00" />
      <circle cx="51" cy="30" r="5" fill="#00A651" />
      <circle cx="29" cy="30" r="8" fill="#ffffff" />
      <circle cx="29" cy="30" r="3.5" fill="#DA291C" />
    </svg>
  );
}

type Result =
  | { kind: "line"; line: Line }
  | { kind: "stop"; id: string; name: string; lat: number; lon: number; lines: string[]; accessible: boolean };

function normalize(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s]/g, "");
}

/** Rank: prefix match on a word beats substring; shorter names win ties. */
function score(name: string, q: string): number {
  const n = normalize(name);
  if (n.startsWith(q)) return 0;
  if (n.split(/\s+/).some(w => w.startsWith(q))) return 1;
  if (n.includes(q)) return 2;
  return -1;
}

function SearchBox() {
  const router = useRouter();
  const { stations } = useNetworkStops();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo<Result[]>(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    const lines = LINES
      .filter(line => !isGreenBranch(line.id))
      .map(line => ({ line, s: Math.min(...[line.name, line.shortName, line.id].map(n => score(n, q)).map(v => (v < 0 ? 99 : v))) }))
      .filter(x => x.s < 99)
      .sort((a, b) => a.s - b.s)
      .slice(0, 4)
      .map(x => ({ kind: "line" as const, line: x.line }));
    const stops = stations
      .map(st => ({ st, s: score(st.name, q) }))
      .filter(x => x.s >= 0)
      .sort((a, b) => a.s - b.s || a.st.name.length - b.st.name.length)
      .slice(0, 7)
      .map(({ st }) => ({ kind: "stop" as const, ...st }));
    return [...stops, ...lines];
  }, [query, stations]);

  // "/" focuses search from anywhere, like most map apps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && t?.tagName !== "INPUT" && t?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  const choose = useCallback((r: Result, el?: HTMLElement | null) => {
    const rect = (el ?? document.getElementById("hud-search"))?.getBoundingClientRect();
    if (rect) setOrigin(rect.left + rect.width / 2, rect.top + rect.height / 2);
    setOpen(false);
    setQuery("");
    (document.activeElement as HTMLElement | null)?.blur();
    if (r.kind === "stop") {
      getEngine()?.flyTo(r.lat, r.lon, 110);
      router.push(`/stop/${r.lines[0]}/${r.id}`);
    } else {
      router.push(`/?mode=${r.line.mode}&line=${r.line.id}`);
    }
  }, [router]);

  const showPanel = open && query.trim().length > 0;

  return (
    <div ref={boxRef} className="relative flex-1 min-w-0 sm:flex-none sm:w-[340px]">
      <label className="hud-chip !p-0 !gap-0 w-full h-12 focus-within:ring-4 focus-within:ring-[#FFC72C]/60 transition-shadow">
        <span className="sr-only">Search stations and lines</span>
        <Search size={18} className="ml-4 mr-2.5 text-ink-3 shrink-0" />
        <input
          ref={inputRef}
          id="hud-search"
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="search-results"
          aria-autocomplete="list"
          placeholder="Search stations & lines"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              choose(results[active], document.getElementById(`search-opt-${active}`));
            } else if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
          }}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 min-w-0 h-full bg-transparent text-[15px] font-semibold text-ink placeholder:text-ink-3 placeholder:font-medium focus:outline-none"
        />
        {query ? (
          <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="mr-2 w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:bg-black/5 focus-ring" aria-label="Clear search">
            <X size={16} />
          </button>
        ) : (
          <kbd className="hidden sm:flex mr-3 w-6 h-6 items-center justify-center rounded-md bg-black/5 text-[12px] font-bold text-ink-3">/</kbd>
        )}
      </label>

      {showPanel && (
        <div id="search-results" role="listbox" className="absolute left-0 right-0 top-[calc(100%+8px)] hud-panel rounded-3xl p-2 search-pop max-h-[60dvh] overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-[13px] font-medium text-ink-3 text-center">No stations or lines match “{query.trim()}”.</p>
          ) : (
            results.map((r, i) => {
              const selected = i === active;
              const cls = `stagger w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors ${selected ? "bg-black/[0.06]" : ""}`;
              const st = { "--stagger-i": i } as CSSProperties;
              if (r.kind === "stop") {
                return (
                  <button key={`s-${r.id}`} id={`search-opt-${i}`} type="button" role="option" aria-selected={selected} className={cls} style={st} onMouseEnter={() => setActive(i)} onClick={e => choose(r, e.currentTarget)}>
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${getLine(r.lines[0])?.color}22`, color: getLine(r.lines[0])?.color }}>
                      <MapPin size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold text-ink truncate">{r.name}</span>
                      <span className="flex items-center gap-1 mt-1">
                        {r.lines.map(l => { const line = getLine(l); return line ? <LineBadge key={l} line={line} size="sm" /> : null; })}
                        {r.accessible && <Accessible size={13} className="text-ink-3 ml-1" aria-label="Accessible" />}
                      </span>
                    </span>
                  </button>
                );
              }
              return (
                <button key={`l-${r.line.id}`} id={`search-opt-${i}`} type="button" role="option" aria-selected={selected} className={cls} style={st} onMouseEnter={() => setActive(i)} onClick={e => choose(r, e.currentTarget)}>
                  <LineBadge line={r.line} size="lg" className="!min-w-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-ink truncate">{r.line.name}</span>
                    <span className="block text-[12px] font-medium text-ink-3 truncate">{MODE_LABELS[r.line.mode]} · {r.line.terminus[0]} ↔ {r.line.terminus[1]}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/** Always-on top bar floating over the map: brand chip and global search. */
export default function Hud() {
  return (
    <div className="fixed top-3 left-3 right-3 sm:top-4 sm:left-4 sm:right-auto z-30 flex items-center gap-2.5 pointer-events-none [&>*]:pointer-events-auto">
      <Link href="/" className="hud-chip !pl-2 !pr-4 h-12 shrink-0 btn-pop focus-ring" aria-label="TrackT home">
        <LogoMark />
        <span className="hidden sm:inline font-extrabold text-[17px] tracking-tight text-ink">TrackT</span>
      </Link>
      <SearchBox />
    </div>
  );
}
