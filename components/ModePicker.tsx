"use client";

import { useRouter } from "next/navigation";
import type { Mode } from "@/lib/lines";
import { LINES_BY_MODE } from "@/lib/lines";

const MODE_CONFIG: Record<Mode, { label: string; tagline: string; icon: string }> = {
  subway: {
    label: "Subway",
    tagline: "Red, Orange, Blue & Green Lines",
    icon: "M",
  },
  commuter_rail: {
    label: "Commuter Rail",
    tagline: "12 routes across Greater Boston",
    icon: "CR",
  },
  bus: {
    label: "Bus",
    tagline: "Key routes across Boston",
    icon: "B",
  },
  ferry: {
    label: "Ferry",
    tagline: "Hingham, Charlestown & Hull",
    icon: "F",
  },
};

const MODE_COLORS: Record<Mode, string> = {
  subway: "#1e293b",
  commuter_rail: "#3b1a3f",
  bus: "#3b2a00",
  ferry: "#003540",
};

const MODE_ACCENT: Record<Mode, string> = {
  subway: "#4ade80",
  commuter_rail: "#c084fc",
  bus: "#fcd34d",
  ferry: "#22d3ee",
};

const MODES: Mode[] = ["subway", "commuter_rail", "bus", "ferry"];

export default function ModePicker() {
  const router = useRouter();

  return (
    <div className="w-full">
      <h2 className="text-[11px] font-bold tracking-[0.2em] text-zinc-500 mb-4">SELECT MODE</h2>
      <div className="grid grid-cols-2 gap-3">
        {MODES.map(mode => {
          const cfg = MODE_CONFIG[mode];
          const lines = LINES_BY_MODE[mode];
          const accent = MODE_ACCENT[mode];
          const bg = MODE_COLORS[mode];
          return (
            <button
              key={mode}
              onClick={() => router.push(`/?mode=${mode}`)}
              className="group relative flex flex-col items-start p-5 rounded-xl border border-zinc-800 hover:border-zinc-600 transition-all text-left cursor-pointer"
              style={{ background: bg }}
            >
              <div
                className="text-2xl font-black tracking-tight mb-3 transition-opacity group-hover:opacity-90"
                style={{ color: accent }}
              >
                {cfg.icon}
              </div>
              <div className="text-sm font-bold text-zinc-100 mb-1">{cfg.label}</div>
              <div className="text-[11px] text-zinc-400 leading-snug">{cfg.tagline}</div>
              <div className="flex gap-1 mt-3 flex-wrap">
                {lines.slice(0, 5).map(line => (
                  <span
                    key={line.id}
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: `${line.color}33`, color: line.color, border: `1px solid ${line.color}44` }}
                  >
                    {line.shortName}
                  </span>
                ))}
                {lines.length > 5 && (
                  <span className="text-[9px] text-zinc-600">+{lines.length - 5} more</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
