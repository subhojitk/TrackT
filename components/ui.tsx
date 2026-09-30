import type { ReactNode } from "react";
import type { Line } from "@/lib/lines";

/* Shared visual primitives. Every panel and list in the app is built from
   these so spacing, radii, and type scale stay consistent. */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card overflow-hidden @container ${className}`}>{children}</section>;
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  count?: number;
  countTone?: "neutral" | "warn" | "danger";
  right?: ReactNode;
  icon?: ReactNode;
}

export function CardHeader({ title, subtitle, count, countTone = "neutral", right, icon }: CardHeaderProps) {
  const toneCls = {
    neutral: "bg-black/[0.06] text-ink-2",
    warn: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
  }[countTone];
  return (
    <header className="flex items-center gap-2.5 px-4 py-3 border-b-[1.5px] border-line">
      {icon && <span className="text-fg-3 flex items-center">{icon}</span>}
      <div className="flex items-baseline gap-2 min-w-0">
        <h2 className="text-[14px] font-extrabold text-ink tracking-tight whitespace-nowrap">{title}</h2>
        {subtitle && <span className="text-[12px] font-medium text-ink-3 truncate hidden @md:inline">{subtitle}</span>}
      </div>
      {typeof count === "number" && count > 0 && (
        <span className={`num text-[11px] font-semibold px-1.5 py-0.5 rounded-md leading-none ${toneCls}`}>{count}</span>
      )}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </header>
  );
}

export function EmptyState({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-center text-center px-6 py-8 text-[13px] font-medium text-ink-3 ${className}`}>
      {children}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-black/[0.06] ${className}`} />;
}

export function Spinner({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`spin ${className}`} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Solid line-colored chip with the route's short name (Red, GL, B, CR…). */
export function LineBadge({ line, size = "md", className = "" }: { line: Pick<Line, "color" | "textColor" | "shortName">; size?: "sm" | "md" | "lg"; className?: string }) {
  const sz = {
    sm: "h-5 min-w-5 px-1.5 text-[10px] rounded-[5px]",
    md: "h-6 min-w-6 px-2 text-[11px] rounded-md",
    lg: "h-8 min-w-8 px-2.5 text-[13px] rounded-lg",
  }[size];
  return (
    <span
      className={`inline-flex items-center justify-center font-extrabold leading-none tracking-wide shrink-0 ${sz} ${className}`}
      style={{ backgroundColor: line.color, color: line.textColor === "black" ? "#141824" : "#ffffff", boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.18)" }}
    >
      {line.shortName}
    </span>
  );
}

export type Tone = "good" | "warn" | "bad" | "neutral" | "info";

export const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-red-600",
  neutral: "text-ink-3",
  info: "text-sky-600",
};

export const TONE_PILL: Record<Tone, string> = {
  good: "bg-emerald-100 text-emerald-700",
  warn: "bg-amber-100 text-amber-700",
  bad: "bg-red-100 text-red-700",
  neutral: "bg-black/[0.05] text-ink-3",
  info: "bg-sky-100 text-sky-700",
};

export function Pill({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold leading-none whitespace-nowrap ${TONE_PILL[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function StatusDot({ tone, pulse = false, className = "" }: { tone: Tone; pulse?: boolean; className?: string }) {
  const bg = { good: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500", neutral: "bg-zinc-400", info: "bg-sky-500" }[tone];
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${bg} ${pulse ? "pulse-dot" : ""} ${className}`} />;
}
