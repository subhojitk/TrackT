"use client";

import dynamic from "next/dynamic";

interface Props {
  currentStopId?: string;
  fillContainer?: boolean;
}

const StopMap = dynamic(() => import("./StopMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-zinc-900 animate-pulse flex items-center justify-center">
      <span className="text-zinc-600 text-xs tracking-widest">LOADING MAP…</span>
    </div>
  ),
});

export default function StopMapDynamic(props: Props) {
  return <StopMap {...props} />;
}
