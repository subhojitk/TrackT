import type { Prediction, Alert } from "@/types/mbta";

const MBTA_BASE = "https://api-v3.mbta.com";
const GL_ROUTES = "Green-B,Green-C,Green-D,Green-E";
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

export async function fetchPredictions(stopId: string): Promise<Prediction[]> {
  const params = new URLSearchParams({
    "filter[stop]": stopId,
    "filter[route]": GL_ROUTES,
    "include": "schedule,trip",
    "sort": "arrival_time",
  });
  const url = `${MBTA_BASE}/predictions?${params}`;
  const res = await fetch(url, {
    headers: headers(),
    cache: "no-store",
  });
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
        headsign: trip?.attributes?.headsign ?? "Green Line",
        route,
        branch: route.replace("Green-", "") || "GL",
        stopId,
      } satisfies Prediction;
    })
    .filter((p: Prediction) => p.predicted !== null);
}

export async function fetchAlerts(stopId: string): Promise<Alert[]> {
  const params = new URLSearchParams({
    "filter[stop]": stopId,
    "filter[route]": GL_ROUTES,
    "filter[datetime]": "NOW",
    "filter[activity]": "BOARD,EXIT,RIDE",
  });
  const url = `${MBTA_BASE}/alerts?${params}`;
  const res = await fetch(url, {
    headers: headers(),
    cache: "no-store",
  });
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
