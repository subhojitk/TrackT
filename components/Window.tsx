"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { setPad, takeOrigin } from "@/lib/mapBus";
import { ChevronDown, ChevronUp, X } from "./icons";

interface Props {
  /** Stable id for the screen space this window reserves on the map. */
  id: string;
  /** Desktop edge the window docks to; phones always get a bottom sheet. */
  dock: "left" | "right";
  /** Desktop width in px. */
  width?: number;
  /** Header band color and the text color that reads on it. */
  accent?: string;
  accentText?: "white" | "black";
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Extra header content (badges) next to the title. */
  headerExtra?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  children: ReactNode;
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A floating panel over the fullscreen map. It grows out of whatever the
 * user touched to open it (a station on the map, a search result), reserves
 * its footprint so the camera recenters in the free space, and can be
 * minimized to just its header to hand the screen back to the map.
 */
export default function Window({
  id, dock, width = 440, accent = "#1d2433", accentText = "white",
  eyebrow, title, headerExtra, onClose, closeLabel = "Close", children,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const [minimized, setMinimized] = useState(false);
  const closing = useRef(false);

  // Expand from the recorded origin (or rise in place when there isn't one)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    const r = el.getBoundingClientRect();
    const o = takeOrigin();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const from = o
      ? `translate(${o.x - cx}px, ${o.y - cy}px) scale(0.05)`
      : `translate(${dock === "left" ? -18 : 18}px, 14px) scale(0.94)`;
    el.animate(
      [
        { transform: from, opacity: 0, borderRadius: "48px" },
        { opacity: 1, offset: 0.25 },
        { transform: "none", opacity: 1, borderRadius: "26px" },
      ],
      { duration: o ? 620 : 420, easing: "cubic-bezier(0.3, 1.32, 0.5, 1)" }
    );
  }, [dock]);

  // Reserve this window's footprint so the map camera frames around it
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => {
      const r = el.getBoundingClientRect();
      if (mq.matches) setPad(id, minimized ? null : { [dock]: r.width + 16 });
      else setPad(id, { bottom: r.height });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    mq.addEventListener("change", apply);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", apply);
      setPad(id, null);
    };
  }, [id, dock, minimized]);

  const close = useCallback(() => {
    const el = ref.current;
    if (!onClose || closing.current) return;
    closing.current = true;
    if (!el || reducedMotion()) { onClose(); return; }
    const a = el.animate(
      [{ transform: "none", opacity: 1 }, { transform: "translateY(18px) scale(0.92)", opacity: 0 }],
      { duration: 200, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }
    );
    a.onfinish = () => onClose();
  }, [onClose]);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, onClose]);

  const fg = accentText === "black" ? "#141824" : "#ffffff";

  return (
    <section
      ref={ref}
      className={`window window--${dock} ${minimized ? "window--min" : ""}`}
      style={{ "--win-w": `${width}px`, "--accent": accent } as CSSProperties}
      aria-label={typeof title === "string" ? title : undefined}
    >
      <header className="window-header" style={{ background: accent, color: fg }}>
        {/* grab handle on phones */}
        <button
          type="button"
          className="md:hidden absolute top-1.5 left-1/2 -translate-x-1/2 w-10 h-1.5 rounded-full bg-current opacity-40"
          onClick={() => setMinimized(m => !m)}
          aria-label={minimized ? "Expand panel" : "Collapse panel"}
        />
        <div className="min-w-0 flex-1">
          {eyebrow && <div className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-80 leading-none mb-1.5 truncate">{eyebrow}</div>}
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-[20px] font-extrabold tracking-tight leading-tight truncate">{title}</h2>
            {headerExtra}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 -mr-1">
          <button
            type="button"
            onClick={() => setMinimized(m => !m)}
            className="win-btn"
            aria-label={minimized ? "Expand panel" : "Minimize panel"}
            title={minimized ? "Expand" : "Minimize"}
          >
            {minimized ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {onClose && (
            <button type="button" onClick={close} className="win-btn" aria-label={closeLabel} title={closeLabel}>
              <X size={18} />
            </button>
          )}
        </div>
      </header>
      <div className="window-body-wrap">
        <div className="window-body">{children}</div>
      </div>
    </section>
  );
}
