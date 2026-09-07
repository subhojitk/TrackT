"use client";

import Link from "next/link";
import type { ComponentType, CSSProperties } from "react";
import type { Mode } from "@/lib/lines";
import { LINES_BY_MODE, MODE_LABELS, MODE_ORDER, MODE_TAGLINES } from "@/lib/lines";
import { Bus, Ferry, Rail, Subway, ChevronRight } from "./icons";
import { LineBadge } from "./ui";

const MODE_ICON: Record<Mode, ComponentType<{ size?: number; className?: string }>> = {
  subway: Subway,
  commuter_rail: Rail,
  bus: Bus,
  ferry: Ferry,
};

const MODE_ACCENT: Record<Mode, string> = {
  subway: "#4ade80",
  commuter_rail: "#c084fc",
  bus: "#fcd34d",
  ferry: "#22d3ee",
};

export default function ModePicker() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {MODE_ORDER.map((mode, i) => {
        const lines = LINES_BY_MODE[mode];
        const Icon = MODE_ICON[mode];
        const accent = MODE_ACCENT[mode];
        return (
          <Link
            key={mode}
            href={`/?mode=${mode}`}
            className="group card card-fluid stagger flex flex-col p-5 hover:border-line-strong hover:bg-surface-2 focus-ring"
            style={{ "--stagger-i": i } as CSSProperties}
          >
            <div className="flex items-start justify-between">
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: `${accent}1f`, color: accent }}
              >
                <Icon size={20} />
              </span>
              <ChevronRight size={16} className="text-fg-3/60 group-hover:text-fg-2 transition-colors mt-1" />
            </div>
            <div className="mt-4 text-[15px] font-semibold text-fg">{MODE_LABELS[mode]}</div>
            <div className="text-[13px] text-fg-3 mt-0.5 leading-snug">{MODE_TAGLINES[mode]}</div>
            <div className="flex items-center gap-1.5 mt-4 flex-wrap">
              {lines.slice(0, 5).map(line => <LineBadge key={line.id} line={line} size="sm" />)}
              {lines.length > 5 && (
                <span className="text-[11px] text-fg-3 ml-0.5">+{lines.length - 5} more</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
