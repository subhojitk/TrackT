"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import type { Line, Mode } from "@/lib/lines";
import { GREEN_BRANCH_IDS, LINES_BY_MODE } from "@/lib/lines";
import { useGreenBranches } from "@/lib/greenBranches";
import { ChevronDown, ChevronRight } from "./icons";
import GreenBranchToggles from "./GreenBranchToggles";
import { LineBadge } from "./ui";

interface Props {
  mode: Mode;
}

function LineRow({ line, mode, subtitle }: { line: Line; mode: Mode; subtitle?: string }) {
  return (
    <Link
      href={`/?mode=${mode}&line=${line.id}`}
      className="group flex items-center gap-3.5 px-3.5 py-3 rounded-[18px] focus-ring"
    >
      <LineBadge line={line} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold text-ink leading-tight">{line.name}</div>
        <div className="text-[12px] font-medium text-ink-3 mt-0.5 truncate">
          {subtitle ?? <>{line.terminus[0]} <span className="opacity-60">↔</span> {line.terminus[1]}</>}
        </div>
      </div>
      <span className="w-7 h-7 rounded-full flex items-center justify-center bg-black/[0.04] text-ink-3 group-hover:bg-[color:var(--c)] group-hover:text-white transition-colors shrink-0" style={{ "--c": line.color } as CSSProperties}>
        <ChevronRight size={15} />
      </span>
    </Link>
  );
}

/** Green Line row with a slim drop-down strip holding the B/C/D/E branch switches. */
function GreenLineRow({ line, mode }: { line: Line; mode: Mode }) {
  const [open, setOpen] = useState(false);
  const visible = useGreenBranches();
  const all = visible.length === GREEN_BRANCH_IDS.length;
  const summary = all
    ? "All branches"
    : visible.length === 0
      ? "No branches shown"
      : `Branches ${visible.map(b => b.replace("Green-", "")).join(", ")}`;

  return (
    <div className="card card-fluid hover:border-line-strong overflow-hidden">
      <LineRow line={line} mode={mode} subtitle={all ? undefined : summary} />
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="green-branches"
        className="w-full h-6 flex items-center justify-center gap-1 border-t-[1.5px] border-line text-[11px] font-bold text-ink-3 hover:text-[#00843D] hover:bg-black/[0.02] transition-colors focus-ring"
      >
        {open ? "Hide branches" : all ? "Branches" : summary}
        <ChevronDown size={13} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        id="green-branches"
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          {open && <GreenBranchToggles className="p-2.5 pt-1" />}
        </div>
      </div>
    </div>
  );
}

export default function LinePicker({ mode }: Props) {
  const lines = LINES_BY_MODE[mode];

  return (
    <ul className="flex flex-col gap-2" role="list">
      {lines.map((line, i) => (
        <li key={line.id} className="stagger" style={{ "--stagger-i": Math.min(i, 12) } as CSSProperties}>
          {line.id === "Green" ? (
            <GreenLineRow line={line} mode={mode} />
          ) : (
            <div className="card card-fluid hover:border-line-strong">
              <LineRow line={line} mode={mode} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
