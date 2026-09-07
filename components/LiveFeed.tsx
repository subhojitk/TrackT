"use client";

import { useState } from "react";
import type { Prediction } from "@/types/mbta";
import { Activity } from "./icons";
import { Card, CardHeader, EmptyState, StatusDot, TONE_TEXT, type Tone } from "./ui";

interface FeedEntry {
  id: string;
  time: string;
  message: string;
  tone: Tone;
}

type Snapshot = { delay: number | null; rel: string | null; headsign: string; branch: string };

function snapshot(predictions: Prediction[]) {
  const map = new Map<string, Snapshot>();
  for (const p of predictions) map.set(p.id, { delay: p.delay, rel: p.scheduleRelationship, headsign: p.headsign, branch: p.branch });
  return map;
}

/** Describe what changed between two polls of the board. */
function diff(prev: Map<string, Snapshot>, next: Map<string, Snapshot>, time: string, stamp: number, showBranch: boolean): FeedEntry[] {
  const label = (s: Snapshot) => (showBranch ? `${s.branch} · ${s.headsign}` : s.headsign);
  const entries: FeedEntry[] = [];

  for (const [id, old] of prev) {
    if (!next.has(id) && old.rel !== "CANCELLED") {
      entries.push({ id: `${id}-gone-${stamp}`, time, message: `${label(old)} departed`, tone: "neutral" });
    }
  }

  for (const [id, cur] of next) {
    const old = prev.get(id);
    if (!old) {
      entries.push({ id: `${id}-new-${stamp}`, time, message: `${label(cur)} added to the board`, tone: "neutral" });
      continue;
    }
    if (cur.rel === "CANCELLED" && old.rel !== "CANCELLED") {
      entries.push({ id: `${id}-cancel-${stamp}`, time, message: `${label(cur)} cancelled`, tone: "bad" });
      continue;
    }
    if (cur.delay !== null && old.delay !== null && cur.delay !== old.delay) {
      const delta = cur.delay - old.delay;
      const nowText = cur.delay > 0 ? `+${cur.delay} min` : cur.delay < 0 ? `${Math.abs(cur.delay)} min early` : "on time";
      entries.push(
        delta > 0
          ? { id: `${id}-d-${stamp}`, time, message: `${label(cur)} slipped ${delta} min — now ${nowText}`, tone: "bad" }
          : { id: `${id}-i-${stamp}`, time, message: `${label(cur)} recovered ${Math.abs(delta)} min — now ${nowText}`, tone: "good" }
      );
    }
  }
  return entries;
}

interface FeedState {
  source: Prediction[] | null;
  snap: Map<string, Snapshot> | null;
  feed: FeedEntry[];
}

interface Props {
  predictions: Prediction[];
  showBranch: boolean;
  /** Parent's clock (ms); refreshed whenever the board changes. */
  now: number;
}

export default function LiveFeed({ predictions, showBranch, now }: Props) {
  // Derived state: re-diff whenever a new predictions array arrives
  const [state, setState] = useState<FeedState>({ source: null, snap: null, feed: [] });
  if (state.source !== predictions) {
    const snap = snapshot(predictions);
    const time = new Date(now).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
    // Skip the very first poll and empty placeholder arrays — nothing has changed yet
    const entries = state.snap && predictions.length > 0 ? diff(state.snap, snap, time, now, showBranch) : [];
    setState({
      source: predictions,
      snap: predictions.length > 0 || state.snap === null ? snap : state.snap,
      feed: [...entries, ...state.feed].slice(0, 40),
    });
  }
  const { feed } = state;

  return (
    <Card>
      <CardHeader
        title="Activity"
        subtitle="Changes to the board since you opened this stop"
        icon={<Activity size={15} />}
        right={<StatusDot tone="good" pulse />}
      />
      {feed.length === 0 ? (
        <EmptyState className="py-6">Watching for delays, cancellations and departures…</EmptyState>
      ) : (
        <ul className="divide-y divide-line max-h-[260px] overflow-y-auto" role="list">
          {feed.map(e => (
            <li key={e.id} className="flex gap-3 px-4 py-2 text-[13px] leading-snug">
              <time className="num text-[11px] text-fg-3 shrink-0 pt-0.5 w-[5.5rem]">{e.time}</time>
              <span className={e.tone === "neutral" ? "text-fg-2" : TONE_TEXT[e.tone]}>{e.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
