"use client";

import Link from "next/link";
import type { ComponentType, CSSProperties } from "react";
import type { Mode } from "@/lib/lines";
import { LINES_BY_MODE, MODE_LABELS, MODE_ORDER, MODE_TAGLINES } from "@/lib/lines";
import { Bus, Ferry, Rail, Subway } from "./icons";
import { LineBadge } from "./ui";

const MODE_ICON: Record<Mode, ComponentType<{ size?: number; className?: string }>> = {
  subway: Subway,
  commuter_rail: Rail,
  bus: Bus,
  ferry: Ferry,
};

/** Solid tile colors per mode, with the text color that reads on each. */
export const MODE_COLORS: Record<Mode, { bg: string; text: "white" | "black" }> = {
  subway: { bg: "#DA291C", text: "white" },
  commuter_rail: { bg: "#80276C", text: "white" },
  bus: { bg: "#FFC72C", text: "black" },
  ferry: { bg: "#008EAA", text: "white" },
};

export default function ModePicker() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {MODE_ORDER.map((mode, i) => {
        const lines = LINES_BY_MODE[mode];
        const Icon = MODE_ICON[mode];
        const { bg, text } = MODE_COLORS[mode];
        const fg = text === "black" ? "#141824" : "#ffffff";
        return (
          <Link
            key={mode}
            href={`/?mode=${mode}`}
            className="group stagger card-fluid relative flex flex-col p-4 rounded-[22px] overflow-hidden focus-ring shadow-[inset_0_-5px_0_rgba(0,0,0,0.14)]"
            style={{ "--stagger-i": i, background: bg, color: fg } as CSSProperties}
          >
            {/* big faint glyph for a flat, poster-like tile */}
            <Icon size={92} className="absolute -right-4 -bottom-5 opacity-15 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6" />
            <span className="w-11 h-11 rounded-2xl flex items-center justify-center bg-white/25">
              <Icon size={22} />
            </span>
            <div className="mt-5 text-[17px] font-extrabold tracking-tight leading-tight">{MODE_LABELS[mode]}</div>
            <div className="text-[12px] font-semibold opacity-80 mt-0.5 leading-snug">{MODE_TAGLINES[mode]}</div>
            <div className="text-[11px] font-bold opacity-70 mt-3 uppercase tracking-wider">{lines.length} lines</div>
          </Link>
        );
      })}
      <div className="col-span-2 flex items-center gap-1.5 flex-wrap mt-1 px-1">
        <span className="text-[12px] font-semibold text-ink-3 mr-1">Jump to</span>
        {LINES_BY_MODE.subway.filter(l => !l.id.startsWith("Green-")).map(line => (
          <Link key={line.id} href={`/?mode=subway&line=${line.id}`} className="btn-pop rounded-md focus-ring">
            <LineBadge line={line} size="md" />
          </Link>
        ))}
      </div>
    </div>
  );
}
