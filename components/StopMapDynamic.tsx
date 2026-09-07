"use client";

import dynamic from "next/dynamic";
import { Spinner } from "./ui";

interface Props {
  currentStopId?: string;
  lineId?: string;
}

const StopMap = dynamic(() => import("./StopMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-[#0b0c10] flex items-center justify-center">
      <div className="flex items-center gap-2.5 text-[13px] text-fg-3">
        <Spinner /> Loading map…
      </div>
    </div>
  ),
});

export default function StopMapDynamic(props: Props) {
  return <StopMap {...props} />;
}
