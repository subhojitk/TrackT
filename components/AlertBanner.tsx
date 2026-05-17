"use client";

import type { Alert } from "@/types/mbta";

const SEVERITY_STYLES: Record<number, string> = {
  1: "bg-yellow-900/40 border-yellow-500/50 text-yellow-200",
  2: "bg-orange-900/40 border-orange-500/50 text-orange-200",
  3: "bg-red-900/40 border-red-500/50 text-red-200",
};

export default function AlertBanner({ alert }: { alert: Alert }) {
  const style = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES[1];
  return (
    <div className={`rounded border px-4 py-2 mb-3 text-sm ${style}`}>
      <span className="font-semibold uppercase tracking-wider text-xs mr-2">
        {alert.effect.replace(/_/g, " ")}
      </span>
      {alert.header}
    </div>
  );
}
