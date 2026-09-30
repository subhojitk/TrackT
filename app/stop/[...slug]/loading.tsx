import { Spinner } from "@/components/ui";

/** Shown while the station loads; the map is already flying there. */
export default function Loading() {
  return (
    <div className="fixed z-20 left-1/2 -translate-x-1/2 bottom-8 md:bottom-auto md:top-24 pop-in hud-chip text-[13px] font-bold text-ink-2">
      <Spinner /> Opening station…
    </div>
  );
}
