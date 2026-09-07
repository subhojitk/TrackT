"use client";

import { useAlerts } from "@/hooks/useAlerts";
import { humanizeEnum } from "@/lib/utils";
import { AlertTriangle, Info } from "./icons";
import { Card, CardHeader, EmptyState, TONE_TEXT, type Tone } from "./ui";

/** MBTA V3 alert severity runs 0–10; 7+ is disruptive, 4–6 is notable. */
export function severityTone(severity: number): Tone {
  if (severity >= 7) return "bad";
  if (severity >= 4) return "warn";
  return "info";
}

export default function AlertsPanel({ stopId, lineId = "Green" }: { stopId: string; lineId?: string }) {
  const { alerts, isLoading } = useAlerts(stopId, lineId);
  const sorted = [...alerts].sort((a, b) => b.severity - a.severity);

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Service alerts"
        subtitle="Affecting this stop"
        count={alerts.length}
        countTone={alerts.some(a => a.severity >= 7) ? "danger" : "warn"}
        icon={<AlertTriangle size={15} />}
      />
      {alerts.length === 0 ? (
        <EmptyState className="flex-1">{isLoading ? "Checking for alerts…" : "No active alerts for this stop."}</EmptyState>
      ) : (
        <ul className="divide-y divide-line" role="list">
          {sorted.map(a => {
            const tone = severityTone(a.severity);
            const Icon = tone === "info" ? Info : AlertTriangle;
            return (
              <li key={a.id} className="flex gap-3 px-4 py-3">
                <Icon size={16} className={`${TONE_TEXT[tone]} shrink-0 mt-0.5`} />
                <div className="min-w-0">
                  <div className={`text-[11px] font-semibold uppercase tracking-wider ${TONE_TEXT[tone]}`}>{humanizeEnum(a.effect)}</div>
                  <p className="text-[13px] text-fg-2 leading-snug mt-0.5">{a.header}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
