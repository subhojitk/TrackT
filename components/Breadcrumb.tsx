"use client";

import type { Mode } from "@/lib/lines";
import { getLine } from "@/lib/lines";

const MODE_LABELS: Record<string, string> = {
  subway: "Subway",
  commuter_rail: "Commuter Rail",
  bus: "Bus",
  ferry: "Ferry",
};

interface Props {
  mode?: Mode;
  lineId?: string;
}

export default function Breadcrumb({ mode, lineId }: Props) {
  const line = lineId ? getLine(lineId) : undefined;

  return (
    <nav className="flex items-center gap-1.5 text-[11px] text-zinc-500 mb-6 flex-wrap">
      <a href="/" className="hover:text-zinc-300 transition-colors">All Modes</a>
      {mode && (
        <>
          <span className="text-zinc-700">›</span>
          <a
            href={`/?mode=${mode}`}
            className="hover:text-zinc-300 transition-colors"
          >
            {MODE_LABELS[mode] ?? mode}
          </a>
        </>
      )}
      {lineId && line && (
        <>
          <span className="text-zinc-700">›</span>
          <span style={{ color: line.color }}>{line.name}</span>
        </>
      )}
    </nav>
  );
}
