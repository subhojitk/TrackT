import StopSelector from "@/components/StopSelector";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-100 mb-2">
          TrackT
        </h1>
        <p className="text-zinc-400 text-sm max-w-sm">
          Real-time MBTA Green Line departures with delay context.
        </p>
      </div>
      <div className="w-full max-w-sm">
        <StopSelector />
      </div>
      <p className="text-xs text-zinc-600">
        Refreshes every 30 seconds · Proxy via Next.js API routes
      </p>
    </div>
  );
}
