"use client";

import { useRouter } from "next/navigation";
import { GL_STOPS, STOP_SECTIONS } from "@/lib/stops";

interface Props {
  currentStopId?: string;
}

export default function StopSelector({ currentStopId }: Props) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value) {
      router.push(`/stop/${e.target.value}`);
    }
  }

  return (
    <select
      value={currentStopId ?? ""}
      onChange={handleChange}
      className="bg-zinc-800 border border-zinc-700 text-zinc-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 w-full max-w-sm"
    >
      <option value="" disabled>
        Select a stop…
      </option>
      {STOP_SECTIONS.map(section => {
        const stops = GL_STOPS.filter(s => s.section === section);
        return (
          <optgroup key={section} label={section}>
            {stops.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.accessible ? " ♿" : ""}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
