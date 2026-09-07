"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "./icons";
import { StatusDot, type Tone } from "./ui";

export interface Crumb {
  label: string;
  href?: string;
  /** Optional swatch shown before the label (line color). */
  color?: string;
}

interface Props {
  /** Line color driving focus rings, selection, and the logo mark. */
  accent?: string;
  crumbs?: Crumb[];
  status?: { tone: Tone; label: string; pulse?: boolean };
  /** Desktop-only left pane. Mounted only at ≥768px so it never polls on phones. */
  map?: ReactNode;
  children: ReactNode;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return isDesktop;
}

function Clock() {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    const update = () =>
      setTime(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <time className="num text-[12px] text-fg-3 hidden md:block min-w-[5.5rem] text-right" suppressHydrationWarning>
      {time ?? ""}
    </time>
  );
}

export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="15" fill="#15161b" />
      <path d="M13 46 L29 30 L51 30" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13" cy="46" r="4.5" fill="var(--accent)" />
      <circle cx="51" cy="30" r="4.5" fill="var(--accent)" />
      <circle cx="29" cy="30" r="7" fill="#ffffff" />
      <circle cx="29" cy="30" r="3" fill="#15161b" />
    </svg>
  );
}

export default function AppShell({ accent = "#22c55e", crumbs = [], status, map, children }: Props) {
  const isDesktop = useIsDesktop();
  const parent = crumbs.length >= 1 ? crumbs[crumbs.length - 2] : undefined;
  const backHref = crumbs.length === 0 ? null : parent?.href ?? "/";
  const backLabel = crumbs.length === 0 ? null : parent?.label ?? "All modes";

  return (
    <div className="h-dvh flex flex-col bg-app" style={{ "--accent": accent } as CSSProperties}>
      <header className="h-14 shrink-0 flex items-center gap-3 sm:gap-5 px-4 sm:px-5 border-b border-line bg-app/85 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 focus-ring rounded-lg" aria-label="TrackT home">
          <LogoMark />
          <span className="font-bold text-[15px] tracking-tight text-fg">TrackT</span>
        </Link>

        {crumbs.length > 0 && (
          <>
            <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1 min-w-0 text-[13px]">
              <ChevronRight size={14} className="text-fg-3/60 shrink-0" />
              <Link href="/" className="text-fg-3 hover:text-fg transition-colors px-1 rounded focus-ring">All modes</Link>
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                const inner = (
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    {c.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />}
                    <span className="truncate">{c.label}</span>
                  </span>
                );
                return (
                  <span key={i} className="flex items-center gap-1 min-w-0">
                    <ChevronRight size={14} className="text-fg-3/60 shrink-0" />
                    {last || !c.href ? (
                      <span className={`px-1 min-w-0 ${last ? "text-fg font-medium" : "text-fg-3"}`} aria-current={last ? "page" : undefined}>{inner}</span>
                    ) : (
                      <Link href={c.href} className="text-fg-3 hover:text-fg transition-colors px-1 rounded min-w-0 focus-ring">{inner}</Link>
                    )}
                  </span>
                );
              })}
            </nav>
            {backHref && (
              <Link href={backHref} className="sm:hidden inline-flex items-center gap-0.5 text-[13px] text-fg-2 hover:text-fg min-w-0 focus-ring rounded">
                <ChevronLeft size={15} /> <span className="truncate">{backLabel}</span>
              </Link>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-4 shrink-0">
          {status && (
            <span className="inline-flex items-center gap-2 text-[12px] font-medium text-fg-2">
              <StatusDot tone={status.tone} pulse={status.pulse} />
              {status.label}
            </span>
          )}
          <Clock />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {map && (
          <aside className="hidden md:block relative shrink-0 border-r border-line bg-[#0b0c10] w-[44vw] min-w-[380px] max-w-[720px]">
            {isDesktop && map}
          </aside>
        )}
        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
