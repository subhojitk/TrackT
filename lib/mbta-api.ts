import type { Prediction, Alert, StopInfo } from "@/types/mbta";

const MBTA_BASE = "https://api-v3.mbta.com";
const API_KEY = process.env.MBTA_API_KEY ?? "";

function headers(): HeadersInit {
  return API_KEY ? { "x-api-key": API_KEY } : {};
}

function buildIncluded(included: any[] = []) {
  const map: Record<string, any> = {};
  included.forEach(item => { map[`${item.type}:${item.id}`] = item; });
  return map;
}

function delayMinutes(predicted: string | null, scheduled: string | null) {
  if (!predicted || !scheduled) return null;
  return Math.round((new Date(predicted).getTime() - new Date(scheduled).getTime()) / 60000);
}

function deriveBranch(route: string): string {
  if (route.startsWith("Green-")) return route.replace("Green-", "");
  return route;
}

export async function fetchPredictions(stopId: string, routes: string[]): Promise<Prediction[]> {
  const params = new URLSearchParams({
    "filter[stop]": stopId,
    "filter[route]": routes.join(","),
    "include": "schedule,trip",
    "sort": "arrival_time",
  });
  const url = `${MBTA_BASE}/predictions?${params}`;
  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`MBTA predictions: ${res.status}`);
  const data = await res.json();
  const inc = buildIncluded(data.included);

  return (data.data ?? [])
    .map((p: any) => {
      const a = p.attributes;
      const route: string = p.relationships?.route?.data?.id ?? "";
      const tripId = p.relationships?.trip?.data?.id;
      const schedId = p.relationships?.schedule?.data?.id;
      const trip = inc[`trip:${tripId}`];
      const sched = schedId ? inc[`schedule:${schedId}`] : null;
      const predicted = a.arrival_time ?? a.departure_time ?? null;
      const scheduled =
        sched?.attributes?.arrival_time ?? sched?.attributes?.departure_time ?? null;

      return {
        id: p.id,
        predicted,
        scheduled,
        delay: delayMinutes(predicted, scheduled),
        directionId: a.direction_id,
        status: a.status ?? null,
        scheduleRelationship: a.schedule_relationship ?? null,
        headsign: trip?.attributes?.headsign ?? route,
        route,
        branch: deriveBranch(route),
        stopId,
      } satisfies Prediction;
    })
    .filter((p: Prediction) => p.predicted !== null);
}

export async function fetchAlerts(stopId: string, routes: string[]): Promise<Alert[]> {
  const params = new URLSearchParams({
    "filter[stop]": stopId,
    "filter[route]": routes.join(","),
    "filter[datetime]": "NOW",
    "filter[activity]": "BOARD,EXIT,RIDE",
  });
  const url = `${MBTA_BASE}/alerts?${params}`;
  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`MBTA alerts: ${res.status}`);
  const data = await res.json();

  return (data.data ?? []).map((a: any) => ({
    id: a.id,
    header: a.attributes.header,
    effect: a.attributes.effect,
    severity: a.attributes.severity,
    updatedAt: a.attributes.updated_at,
  }));
}

export async function fetchStopById(stopId: string): Promise<StopInfo | null> {
  const params = new URLSearchParams({
    "fields[stop]": "name,latitude,longitude,wheelchair_boarding",
  });
  const res = await fetch(`${MBTA_BASE}/stops/${stopId}?${params}`, {
    headers: headers(),
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const a = data.data?.attributes;
  if (!a) return null;
  return {
    id: stopId,
    name: a.name,
    section: "",
    lat: a.latitude,
    lon: a.longitude,
    accessible: a.wheelchair_boarding === 1,
  };
}

export async function fetchRoutesForStop(stopId: string): Promise<string[]> {
  const params = new URLSearchParams({ "filter[stop]": stopId, "fields[route]": "id" });
  const res = await fetch(`${MBTA_BASE}/routes?${params}`, {
    headers: headers(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data ?? []).map((r: any) => r.id as string);
}
