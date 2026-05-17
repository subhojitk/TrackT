export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function minutesUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

export function delayLabel(delay: number | null): { text: string; cls: string } {
  if (delay === null) return { text: "—", cls: "text-muted" };
  if (delay <= 0) return { text: delay === 0 ? "On time" : `${Math.abs(delay)}m early`, cls: "text-green-400" };
  if (delay <= 2) return { text: `+${delay}m`, cls: "text-yellow-400" };
  return { text: `+${delay}m`, cls: "text-red-400" };
}

export function branchColor(branch: string): string {
  const map: Record<string, string> = {
    B: "bg-green-700",
    C: "bg-green-700",
    D: "bg-green-700",
    E: "bg-green-700",
  };
  return map[branch] ?? "bg-green-700";
}

export function branchBadgeColor(branch: string): string {
  const map: Record<string, string> = {
    B: "bg-green-600 text-white",
    C: "bg-green-500 text-white",
    D: "bg-teal-500 text-white",
    E: "bg-emerald-600 text-white",
  };
  return map[branch] ?? "bg-green-600 text-white";
}

export function countdown(mins: number | null): string {
  if (mins === null) return "—";
  if (mins <= 0) return "Now";
  if (mins === 1) return "1 min";
  return `${mins} min`;
}
