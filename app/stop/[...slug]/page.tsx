import { notFound, redirect } from "next/navigation";
import { fetchStopById, fetchRoutesForStop } from "@/lib/mbta-api";
import { getLine, inferLineId } from "@/lib/lines";
import DashboardLayout from "@/components/DashboardLayout";

interface Props {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  if (slug.length === 2) {
    const [routeId, stopId] = slug;
    const [stop, line] = await Promise.all([
      fetchStopById(stopId),
      Promise.resolve(getLine(routeId)),
    ]);
    return { title: `${stop?.name ?? "Stop"} — ${line?.name ?? "MBTA"} — TrackT` };
  }
  return { title: "Stop — TrackT" };
}

export default async function StopPage({ params }: Props) {
  const { slug } = await params;

  if (slug.length === 2) {
    const [routeId, stopId] = slug;
    const [stop, line] = await Promise.all([
      fetchStopById(stopId),
      Promise.resolve(getLine(routeId)),
    ]);
    if (!stop || !line) notFound();
    return <DashboardLayout stopId={stopId} stopName={stop.name} lineId={routeId} />;
  }

  if (slug.length === 1) {
    const stopId = slug[0];
    const routes = await fetchRoutesForStop(stopId);
    const lineId = routes.length > 0 ? inferLineId(routes[0]) : "Green";
    redirect(`/stop/${lineId}/${stopId}`);
  }

  notFound();
}
