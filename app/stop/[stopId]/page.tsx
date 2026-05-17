import { notFound } from "next/navigation";
import { getStop } from "@/lib/stops";
import DepartureBoard from "@/components/DepartureBoard";
import StopSelector from "@/components/StopSelector";

interface Props {
  params: Promise<{ stopId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { stopId } = await params;
  const stop = getStop(stopId);
  return {
    title: stop ? `${stop.name} — Honest Commute` : "Stop — Honest Commute",
  };
}

export default async function StopPage({ params }: Props) {
  const { stopId } = await params;
  const stop = getStop(stopId);
  if (!stop) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <StopSelector currentStopId={stopId} />
      </div>
      <DepartureBoard stopId={stop.id} stopName={stop.name} />
    </div>
  );
}
