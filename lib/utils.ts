import { getLine } from "./lines";
import type { Tone } from "@/components/ui";

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function minutesUntil(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - now) / 60000);
}

/** "Now", "1 min", "12 min" */
export function countdown(mins: number | null): string {
  if (mins === null) return "—";
  if (mins <= 0) return "Now";
  return `${mins} min`;
}

export interface DelayInfo {
  text: string;
  tone: Tone;
}

export function delayLabel(delay: number | null): DelayInfo {
  if (delay === null) return { text: "Scheduled", tone: "neutral" };
  if (delay < 0) return { text: `${Math.abs(delay)} min early`, tone: "info" };
  if (delay === 0) return { text: "On time", tone: "good" };
  if (delay <= 2) return { text: `+${delay} min`, tone: "warn" };
  return { text: `+${delay} min`, tone: "bad" };
}

export function routeBadgeStyle(lineOrBranch: string): { bg: string; text: string } {
  // Try direct match first (e.g., "Red", "Green-B"), then GL branch letter shorthand
  const line = getLine(lineOrBranch) ?? getLine(`Green-${lineOrBranch}`);
  return {
    bg:   line?.color    ?? "#3f3f46",
    text: line?.textColor === "black" ? "#0a0a0c" : "#ffffff",
  };
}

/** "just now", "12s ago", "3 min ago" */
export function relativeTime(date: Date | null, now = Date.now()): string {
  if (!date) return "—";
  const s = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

/** Sentence-case an MBTA enum like "STATION_CLOSURE" → "Station closure". */
export function humanizeEnum(value: string): string {
  const s = value.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
