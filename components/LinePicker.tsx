"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { Mode } from "@/lib/lines";
import { LINES_BY_MODE } from "@/lib/lines";
import { ChevronRight } from "./icons";
import { LineBadge } from "./ui";

interface Props {
  mode: Mode;
}

export default function LinePicker({ mode }: Props) {
  const lines = LINES_BY_MODE[mode];

  return (
    <ul className="flex flex-col gap-2" role="list">
      {lines.map((line, i) => (
        <li key={line.id}>
          <Link
            href={`/?mode=${mode}&line=${line.id}`}
            className="group card card-fluid stagger flex items-center gap-3.5 px-3.5 py-3 hover:border-line-strong focus-ring"
            style={{ "--stagger-i": Math.min(i, 12) } as CSSProperties}
          >
            <LineBadge line={line} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-ink leading-tight">{line.name}</div>
              <div className="text-[12px] font-medium text-ink-3 mt-0.5 truncate">
                {line.terminus[0]} <span className="opacity-60">↔</span> {line.terminus[1]}
              </div>
            </div>
            <span className="w-7 h-7 rounded-full flex items-center justify-center bg-black/[0.04] text-ink-3 group-hover:bg-[color:var(--c)] group-hover:text-white transition-colors shrink-0" style={{ "--c": line.color } as CSSProperties}>
              <ChevronRight size={15} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
