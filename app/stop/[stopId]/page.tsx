import { notFound } from "next/navigation";
import { getStop } from "@/lib/stops";
import DashboardLayout from "@/components/DashboardLayout";

interface Props {
  params: Promise<{ stopId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { stopId } = await params;
  const stop = getStop(stopId);
  return {
    title: stop ? `${stop.name} — TrackT` : "Stop — TrackT",
  };
}

export default async function StopPage({ params }: Props) {
  const { stopId } = await params;
  const stop = getStop(stopId);
  if (!stop) notFound();

  return <DashboardLayout stopId={stop.id} stopName={stop.name} />;
}
