"use client";

import { useRouter } from "next/navigation";
import type { Mode } from "@/lib/lines";
import { LINES_BY_MODE } from "@/lib/lines";

interface Props {
  mode: Mode;
}

export default function LinePicker({ mode }: Props) {
  const router = useRouter();
  const lines = LINES_BY_MODE[mode];

  return (
    <div className="w-full">
      <h2 className="text-[11px] font-bold tracking-[0.2em] text-zinc-500 mb-4">SELECT LINE</h2>
      <div className="flex flex-col gap-2">
        {lines.map(line => (
          <button
            key={line.id}
            onClick={() => router.push(`/?mode=${mode}&line=${line.id}`)}
            className="group flex items-center gap-4 p-4 rounded-xl border border-zinc-800 hover:border-zinc-600 bg-zinc-900/40 hover:bg-zinc-900/80 transition-all text-left cursor-pointer"
          >
            <span
              className="shrink-0 text-xs font-black px-2.5 py-1.5 rounded-md min-w-[2.5rem] text-center"
              style={{ backgroundColor: line.color, color: line.textColor === "black" ? "#000" : "#fff" }}
            >
              {line.shortName}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-zinc-100">{line.name}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                {line.terminus[0]} ↔ {line.terminus[1]}
              </div>
            </div>
            <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors text-sm">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
