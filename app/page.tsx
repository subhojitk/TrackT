import StopSelector from "@/components/StopSelector";
import StopMap from "@/components/StopMapDynamic";

export default function Home() {
  return (
    <div className="flex flex-col min-h-dvh bg-zinc-950 font-mono">
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
        <span className="text-green-400 font-bold tracking-[0.2em] text-sm">TRACKT</span>
        <span className="text-zinc-600 text-xs tracking-widest">MBTA GREEN LINE</span>
      </header>

      <main className="flex-1 flex flex-col gap-6 p-4 max-w-3xl mx-auto w-full">
        <div className="text-center pt-6">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100 mb-1">TrackT</h1>
          <p className="text-zinc-500 text-sm">Real-time MBTA Green Line departures with delay context.</p>
        </div>

        <div className="w-full max-w-sm mx-auto">
          <StopSelector />
        </div>

        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 mb-2">NETWORK MAP — CLICK A STOP</div>
          <StopMap />
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-4 py-3 text-[11px] text-zinc-600 text-center font-mono">
        Data from MBTA V3 API · Historical baselines from MBTA LAMP · Refreshes every 30s
      </footer>
    </div>
  );
}
