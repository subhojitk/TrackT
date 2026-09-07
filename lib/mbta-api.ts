import type { Prediction, Alert, StopInfo } from "@/types/mbta";
import { relId, str, num, type Document, type Resource, type SingleDocument } from "./jsonapi";

const MBTA_BASE = "https://api-v3.mbta.com";
const API_KEY = process.env.MBTA_API_KEY ?? "";

function headers(): HeadersInit {
  return API_KEY ? { "x-api-key": API_KEY } : {};
}

function buildIncluded(included: Resource[] = []) {
  const map = new Map<string, Resource>();
  for (const item of included) map.set(`${item.type}:${item.id}`, item);
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
  const data: Document = await res.json();
  const inc = buildIncluded(data.included);

  return (data.data ?? [])
    .map((p): Prediction => {
      const a = p.attributes;
      const route = relId(p, "route") ?? "";
      const tripId = relId(p, "trip");
      const schedId = relId(p, "schedule");
      const trip = tripId ? inc.get(`trip:${tripId}`) : undefined;
      const sched = schedId ? inc.get(`schedule:${schedId}`) : undefined;
      const predicted = str(a.arrival_time) ?? str(a.departure_time);
      const scheduled = str(sched?.attributes.arrival_time) ?? str(sched?.attributes.departure_time);

      return {
        id: p.id,
        predicted,
        scheduled,
        delay: delayMinutes(predicted, scheduled),
        directionId: (num(a.direction_id) ?? 0) as 0 | 1,
        status: str(a.status),
        scheduleRelationship: str(a.schedule_relationship),
        headsign: str(trip?.attributes.headsign) ?? route,
        route,
        branch: deriveBranch(route),
        stopId,
      };
    })
    .filter(p => p.predicted !== null);
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
  const data: Document = await res.json();

  return (data.data ?? []).map((a): Alert => ({
    id: a.id,
    header: str(a.attributes.header) ?? "",
    effect: str(a.attributes.effect) ?? "UNKNOWN_EFFECT",
    severity: num(a.attributes.severity) ?? 0,
    updatedAt: str(a.attributes.updated_at) ?? "",
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
  const data: SingleDocument = await res.json();
  const a = data.data?.attributes;
  if (!a) return null;
  return {
    id: stopId,
    name: str(a.name) ?? stopId,
    section: "",
    lat: num(a.latitude) ?? 0,
    lon: num(a.longitude) ?? 0,
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
  const data: Document = await res.json();
  return (data.data ?? []).map(r => r.id);
}
