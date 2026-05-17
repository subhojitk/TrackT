"use client";

import { useAlerts } from "@/hooks/useAlerts";

const EFFECT_ICON: Record<string, string> = {
  DELAY:           "▲",
  SUSPENSION:      "✕",
  DETOUR:          "↺",
  SHUTTLE:         "⇌",
  STOP_CLOSURE:    "✕",
  STATION_CLOSURE: "✕",
  SERVICE_CHANGE:  "◈",
  ACCESS_ISSUE:    "♿",
};

const SEVERITY_CLS: Record<number, string> = {
  1: "text-yellow-400",
  2: "text-orange-400",
  3: "text-red-400",
};

export default function AlertsPanel({ stopId }: { stopId: string }) {
  const { alerts } = useAlerts(stopId);

  return (
    <div className="flex flex-col h-full border-r border-zinc-800 min-w-0" style={{ flex: "0 0 40%" }}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
        <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-400">ALERTS</span>
        {alerts.length > 0 && (
          <span className="text-[10px] font-bold text-red-400 bg-red-900/30 px-1 rounded">
            {alerts.length}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {alerts.length === 0 && (
          <div className="flex items-center justify-center h-full text-[11px] text-zinc-600 tracking-widest">
            NO ACTIVE ALERTS
          </div>
        )}
        {alerts.map(a => {
          const icon = EFFECT_ICON[a.effect] ?? "◈";
          const sevCls = SEVERITY_CLS[a.severity] ?? SEVERITY_CLS[1];
          return (
            <div key={a.id} className="border border-zinc-800 rounded bg-zinc-900/40 px-2.5 py-2">
              <div className="flex gap-2 items-start">
                <span className={`${sevCls} text-sm shrink-0 mt-0.5`}>{icon}</span>
                <div className="min-w-0">
                  <div className="text-[9px] tracking-[0.15em] text-zinc-600 uppercase mb-0.5">
                    {a.effect.replace(/_/g, " ")}
                  </div>
                  <div className="text-[11px] text-zinc-300 leading-snug">{a.header}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
