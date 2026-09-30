/**
 * Tiny client-side bus between the persistent 3D map and the floating
 * windows drawn over it. Lives outside React so the map (mounted once in the
 * root layout) and any page can talk without prop drilling or remounts.
 */
import type { MapEngine, Padding } from "@/components/map3d/engine";

// ── Screen space reserved by windows ────────────────────────────────────

const pads = new Map<string, Partial<Padding>>();
let merged: Padding = { top: 0, right: 0, bottom: 0, left: 0 };
const listeners = new Set<() => void>();

function recompute() {
  const next: Padding = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const p of pads.values()) {
    for (const side of ["top", "right", "bottom", "left"] as const) {
      next[side] = Math.max(next[side], p[side] ?? 0);
    }
  }
  if (next.top === merged.top && next.right === merged.right && next.bottom === merged.bottom && next.left === merged.left) return;
  merged = next;
  engine?.setPadding(merged);
  for (const l of listeners) l();
}

export function setPad(id: string, pad: Partial<Padding> | null) {
  if (pad) pads.set(id, pad);
  else pads.delete(id);
  recompute();
}

export function getPadding(): Padding {
  return merged;
}

export function subscribePadding(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ── Engine handle ───────────────────────────────────────────────────────

let engine: MapEngine | null = null;

export function setEngine(e: MapEngine | null) {
  engine = e;
  e?.setPadding(merged);
}

export function getEngine() {
  return engine;
}

// ── Where the next window should expand from ────────────────────────────

let origin: { x: number; y: number; t: number } | null = null;

/** Record the screen point a window should grow out of (a click, a search box). */
export function setOrigin(x: number, y: number) {
  origin = { x, y, t: performance.now() };
}

/** Consume the pending origin if it's fresh. */
export function takeOrigin(): { x: number; y: number } | null {
  const o = origin;
  origin = null;
  if (!o || performance.now() - o.t > 4000) return null;
  return { x: o.x, y: o.y };
}

/** Convenience for onClick handlers on links that open a window. */
export function originFromEvent(e: { clientX: number; clientY: number; currentTarget: EventTarget }) {
  if (e.clientX || e.clientY) {
    setOrigin(e.clientX, e.clientY);
  } else {
    // keyboard activation: use the element's center
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setOrigin(r.left + r.width / 2, r.top + r.height / 2);
  }
}
