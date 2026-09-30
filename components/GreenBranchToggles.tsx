"use client";

import type { CSSProperties } from "react";
import { GREEN_BRANCH_IDS, getLine } from "@/lib/lines";
import { toggleGreenBranch, useGreenBranches } from "@/lib/greenBranches";

const GREEN = "#00843D";

/** B/C/D/E switches: green fill when shown, green outline when hidden. */
export default function GreenBranchToggles({ className = "" }: { className?: string }) {
  const visible = useGreenBranches();
  return (
    <div className={`grid grid-cols-2 gap-1.5 ${className}`} role="group" aria-label="Green Line branches">
      {GREEN_BRANCH_IDS.map((id, i) => {
        const line = getLine(id)!;
        const on = visible.includes(id);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => toggleGreenBranch(id)}
            className="stagger btn-pop flex items-center gap-2 min-w-0 h-9 pl-1.5 pr-2.5 rounded-xl border-2 text-left focus-ring transition-colors"
            style={{
              "--stagger-i": i,
              borderColor: GREEN,
              background: on ? GREEN : "transparent",
              color: on ? "#ffffff" : GREEN,
            } as CSSProperties}
            title={`${on ? "Hide" : "Show"} the ${line.name}`}
          >
            <span
              className="w-6 h-6 rounded-lg flex items-center justify-center text-[12px] font-extrabold shrink-0"
              style={{ background: on ? "rgba(255,255,255,0.22)" : `${GREEN}1a` }}
            >
              {line.shortName}
            </span>
            <span className="text-[12px] font-bold truncate">{line.terminus[1]}</span>
          </button>
        );
      })}
    </div>
  );
}
