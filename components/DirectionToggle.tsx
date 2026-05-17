"use client";

type Direction = "all" | "0" | "1";

interface Props {
  value: Direction;
  onChange: (d: Direction) => void;
}

const OPTIONS: { label: string; value: Direction }[] = [
  { label: "All", value: "all" },
  { label: "Inbound", value: "1" },
  { label: "Outbound", value: "0" },
];

export default function DirectionToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded bg-zinc-800 p-0.5 gap-0.5">
      {OPTIONS.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            value === o.value
              ? "bg-green-700 text-white"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
