"use client";

import dynamic from "next/dynamic";

interface Props {
  currentStopId?: string;
  lineId?: string;
}

// three.js needs the DOM; the sky gradient stands in until the engine boots
const StopMap = dynamic(() => import("./StopMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 sky-bg" />,
});

export default function StopMapDynamic(props: Props) {
  return <StopMap {...props} />;
}
