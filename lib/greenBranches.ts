"use client";

/**
 * Which Green Line branches are shown. Shared by the pickers and the map;
 * every branch is on by default, so "Green Line" means the whole line.
 */
import { useMemo, useSyncExternalStore } from "react";
import { useShapes } from "@/hooks/useShapes";
import { project, WORLD_SCALE } from "./geo";
import { GREEN_BRANCH_IDS, isGreenBranch, type GreenBranchId } from "./lines";

let selected: readonly GreenBranchId[] = GREEN_BRANCH_IDS;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const getSelected = () => selected;
const getDefault = () => GREEN_BRANCH_IDS;

export function toggleGreenBranch(id: GreenBranchId) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected = GREEN_BRANCH_IDS.filter(b => next.has(b)); // keep B, C, D, E order
  for (const l of listeners) l();
}

export function useGreenBranches(): readonly GreenBranchId[] {
  return useSyncExternalStore(subscribe, getSelected, getDefault);
}

/** Is an MBTA route (or shape key like "Green-B~1") hidden by the branch toggles? */
export function isRouteHidden(route: string, visible: readonly GreenBranchId[]): boolean {
  const base = route.split("~")[0];
  return isGreenBranch(base) && !visible.includes(base);
}

/** A station counts as on a track within this many meters of it. */
const ON_TRACK_METERS = 110;

/**
 * Predicate for "is this spot on a visible Green branch?", or null when every
 * branch is visible (no filtering needed) or the tracks haven't loaded yet.
 * Uses the drawn track geometry rather than per-route stop lists, so what's
 * listed always matches what's on the map (branches can be through-routed).
 */
export function useGreenStopFilter(visible: readonly GreenBranchId[]): ((lat: number, lon: number) => boolean) | null {
  const all = visible.length === GREEN_BRANCH_IDS.length;
  const { shapes } = useShapes("Green");
  return useMemo(() => {
    if (all || Object.keys(shapes).length === 0) return null;
    const tracks = Object.entries(shapes)
      .filter(([key]) => !isRouteHidden(key, visible))
      .map(([, pts]) => pts.map(([lat, lon]) => project(lat, lon)));
    const r = ON_TRACK_METERS * WORLD_SCALE;
    const r2 = r * r;
    return (lat: number, lon: number) => {
      const p = project(lat, lon);
      for (const t of tracks) {
        for (let i = 0; i < t.length - 1; i++) {
          const a = t[i], b = t[i + 1];
          const dx = b.x - a.x, dz = b.z - a.z;
          const len2 = dx * dx + dz * dz;
          const k = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
          const ex = p.x - a.x - k * dx, ez = p.z - a.z - k * dz;
          if (ex * ex + ez * ez < r2) return true;
        }
      }
      return false;
    };
  }, [all, shapes, visible]);
}
