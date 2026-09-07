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
            className="group card card-fluid stagger flex items-center gap-4 px-4 py-3.5 hover:border-line-strong hover:bg-surface-2 focus-ring"
            style={{ "--stagger-i": Math.min(i, 12) } as CSSProperties}
          >
            <LineBadge line={line} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-fg leading-tight">{line.name}</div>
              <div className="text-[12px] text-fg-3 mt-0.5 truncate">
                {line.terminus[0]} <span className="text-fg-3/60">↔</span> {line.terminus[1]}
              </div>
            </div>
            <ChevronRight size={16} className="text-fg-3/60 group-hover:text-fg-2 transition-colors shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
