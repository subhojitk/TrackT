"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

type Props = ComponentProps<typeof import("./StopMap").default>;

// three.js needs the DOM; the sky gradient stands in until the engine boots
const StopMap = dynamic(() => import("./StopMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 sky-bg" />,
});

export default function StopMapDynamic(props: Props) {
  return <StopMap {...props} />;
}
