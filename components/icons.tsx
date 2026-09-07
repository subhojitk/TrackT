import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...rest,
  };
}

export const ChevronRight = (p: IconProps) => (
  <svg {...base(p)}><path d="m9 6 6 6-6 6" /></svg>
);

export const ChevronLeft = (p: IconProps) => (
  <svg {...base(p)}><path d="m15 6-6 6 6 6" /></svg>
);

export const Search = (p: IconProps) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);

export const Plus = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);

export const Minus = (p: IconProps) => (
  <svg {...base(p)}><path d="M5 12h14" /></svg>
);

export const Crosshair = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="7" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </svg>
);

export const Refresh = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 11a8 8 0 1 0 2.3 5.7" /><path d="M20 4v7h-7" />
  </svg>
);

export const AlertTriangle = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 9v5M12 17.5v.5" />
  </svg>
);

export const Info = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.5" /></svg>
);

export const Accessible = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="4.5" r="1.7" fill="currentColor" stroke="none" />
    <path d="M10 8.5v6h6l3 5" /><path d="M10 9.5h4.5" />
    <path d="M9.5 12.2a5 5 0 1 0 6.7 6.2" />
  </svg>
);

export const Clock = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);

export const Calendar = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export const Users = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.2" /><path d="M2.5 19a6.5 6.5 0 0 1 13 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5.6M18.5 13.5a5.5 5.5 0 0 1 3 5.5" />
  </svg>
);

export const Activity = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 12h4l3-7 4 14 3-7h4" /></svg>
);

export const ArrowUpRight = (p: IconProps) => (
  <svg {...base(p)}><path d="M7 17 17 7M8 7h9v9" /></svg>
);

export const Layers = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" />
  </svg>
);

/* ── Mode glyphs ─────────────────────────────────────────────────────── */

export const Subway = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="5" y="3" width="14" height="14" rx="3.5" />
    <path d="M5 11h14" /><path d="M8.5 21 10 18M15.5 21 14 18" />
    <circle cx="9" cy="14" r="0.6" fill="currentColor" /><circle cx="15" cy="14" r="0.6" fill="currentColor" />
  </svg>
);

export const Rail = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 3h12a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Z" />
    <path d="M4 10h16M12 3v7" /><path d="m8 21 1.5-4M16 21l-1.5-4M6 21h12" />
  </svg>
);

export const Bus = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="16" height="14" rx="3" /><path d="M4 11h16" />
    <path d="M7 21v-3M17 21v-3" />
    <circle cx="8" cy="15" r="0.6" fill="currentColor" /><circle cx="16" cy="15" r="0.6" fill="currentColor" />
  </svg>
);

export const Ferry = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 15h16l-2 4H6l-2-4Z" /><path d="M6 15V9h12v6" /><path d="M9 9V6h6v3" />
    <path d="M2.5 21c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 5.5 0" />
  </svg>
);
