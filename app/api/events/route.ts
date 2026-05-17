import { NextResponse } from "next/server";
import type { TransitEvent } from "@/types/mbta";
import { VENUES, RED_SOX_TEAM_ID, BRUINS_ABBREV, CELTICS_ESPN_SLUG, type StopRef } from "@/lib/venues";
import { GL_STOPS } from "@/lib/stops";

const TM_KEY = process.env.TICKETMASTER_API_KEY ?? "";

// Find nearest GL stops to a lat/lon (returns up to 2 within 0.75 miles)
function nearbyStops(lat: number, lon: number): StopRef[] {
  const R = 3959; // earth radius miles
  return GL_STOPS
    .map(s => {
      const dLat = ((s.lat - lat) * Math.PI) / 180;
      const dLon = ((s.lon - lon) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((s.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      const miles = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return { stopId: s.id, lineId: "Green", miles };
    })
    .filter(s => s.miles <= 0.75)
    .sort((a, b) => a.miles - b.miles)
    .slice(0, 2)
    .map(({ stopId, lineId }) => ({ stopId, lineId }));
}

function crowdFromCapacity(cap: number | undefined): TransitEvent["crowdLevel"] {
  if (!cap) return "medium";
  if (cap >= 5000) return "very-high";
  if (cap >= 1500) return "high";
  return "medium";
}

function dateRange(days = 3): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

async function fetchRedSox(dates: string[]): Promise<TransitEvent[]> {
  const start = dates[0];
  const end = dates[dates.length - 1];
  const url = `https://statsapi.mlb.com/api/v1/schedule?teamId=${RED_SOX_TEAM_ID}&sportId=1&startDate=${start}&endDate=${end}&hydrate=team,venue`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const data = await res.json();

  const events: TransitEvent[] = [];
  for (const date of data.dates ?? []) {
    for (const game of date.games ?? []) {
      const isHome = game.teams?.home?.team?.id === RED_SOX_TEAM_ID;
      if (!isHome) continue;
      const venueName = game.venue?.name ?? "Fenway Park";
      const meta = VENUES[venueName] ?? VENUES["Fenway Park"];
      const away = game.teams?.away?.team?.name ?? "Visitor";
      events.push({
        id: `mlb-${game.gamePk}`,
        name: `${away} @ Red Sox`,
        venue: venueName,
        area: meta.area,
        startTime: game.gameDate,
        sport: "MLB",
        affectedStops: meta.affectedStops,
        crowdLevel: meta.crowdLevel,
      });
    }
  }
  return events;
}

async function fetchBruins(): Promise<TransitEvent[]> {
  const url = `https://api-web.nhle.com/v1/club-schedule/${BRUINS_ABBREV}/month/now`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const data = await res.json();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 3);
  const meta = VENUES["TD Garden"];
  const events: TransitEvent[] = [];

  for (const game of data.games ?? []) {
    const isHome = game.homeTeam?.abbrev === BRUINS_ABBREV;
    if (!isHome) continue;
    const start = new Date(game.startTimeUTC);
    if (start < new Date() || start > cutoff) continue;
    const awayName = `${game.awayTeam?.placeName?.default ?? ""} ${game.awayTeam?.commonName?.default ?? "Visitor"}`.trim();
    events.push({
      id: `nhl-${game.id}`,
      name: `${awayName} @ Bruins`,
      venue: "TD Garden",
      area: meta.area,
      startTime: game.startTimeUTC,
      sport: "NHL",
      affectedStops: meta.affectedStops,
      crowdLevel: meta.crowdLevel,
    });
  }
  return events;
}

async function fetchTicketmaster(): Promise<TransitEvent[]> {
  if (!TM_KEY) return [];
  const now = new Date().toISOString().replace(".000", "");
  const end = new Date(Date.now() + 3 * 86_400_000).toISOString().replace(".000", "");
  // Search 3-mile radius around Boston Common
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?latlong=42.3554,-71.0655&radius=3&unit=miles&startDateTime=${now}&endDateTime=${end}&size=30&sort=date,asc&apikey=${TM_KEY}`;
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) return [];
  const data = await res.json();

  const events: TransitEvent[] = [];
  for (const e of data._embedded?.events ?? []) {
    const venue = e._embedded?.venues?.[0];
    const venueName: string = venue?.name ?? "Unknown Venue";
    const lat = parseFloat(venue?.location?.latitude ?? "0");
    const lon = parseFloat(venue?.location?.longitude ?? "0");

    // Check known venue DB first, then fall back to geo-matching
    const knownMeta = VENUES[venueName];
    const affectedStops = knownMeta?.affectedStops ?? (lat && lon ? nearbyStops(lat, lon) : []);
    if (affectedStops.length === 0) continue; // not near Green Line — skip

    const capacity = venue?.upcomingEvents?._total;
    const crowd = knownMeta?.crowdLevel ?? crowdFromCapacity(capacity);
    const area = knownMeta?.area ?? venueName;

    // Classify sport type
    const segment: string = e.classifications?.[0]?.segment?.name ?? "EVENT";
    const sport: TransitEvent["sport"] =
      segment === "Sports" ? "MLB" : // re-use for display; icon handled by name
      "EVENT";

    events.push({
      id: `tm-${e.id}`,
      name: e.name,
      venue: venueName,
      area,
      startTime: e.dates?.start?.dateTime ?? e.dates?.start?.localDate,
      sport,
      affectedStops,
      crowdLevel: crowd,
    });
  }
  return events;
}

async function fetchCeltics(): Promise<TransitEvent[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${CELTICS_ESPN_SLUG}/schedule`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const data = await res.json();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 3);
  const meta = VENUES["TD Garden"];
  const events: TransitEvent[] = [];

  for (const event of data.events ?? []) {
    const competition = event.competitions?.[0];
    if (!competition) continue;
    const homeTeam = competition.competitors?.find((c: any) => c.homeAway === "home");
    if (homeTeam?.team?.slug !== "boston-celtics") continue;
    const start = new Date(event.date);
    if (start < new Date() || start > cutoff) continue;
    const awayTeam = competition.competitors?.find((c: any) => c.homeAway === "away");
    const awayName = awayTeam?.team?.displayName ?? "Visitor";
    events.push({
      id: `nba-${event.id}`,
      name: `${awayName} @ Celtics`,
      venue: "TD Garden",
      area: meta.area,
      startTime: event.date,
      sport: "NBA",
      affectedStops: meta.affectedStops,
      crowdLevel: meta.crowdLevel,
    });
  }
  return events;
}

export async function GET() {
  const dates = dateRange(3);

  const [sox, bruins, celtics, tm] = await Promise.allSettled([
    fetchRedSox(dates),
    fetchBruins(),
    fetchCeltics(),
    fetchTicketmaster(),
  ]);

  if (sox.status === "rejected") console.error("[events:mlb]", sox.reason);
  if (bruins.status === "rejected") console.error("[events:nhl]", bruins.reason);
  if (celtics.status === "rejected") console.error("[events:nba]", celtics.reason);
  if (tm.status === "rejected") console.error("[events:tm]", tm.reason);

  console.log("[events] sox:", sox.status === "fulfilled" ? sox.value.length : "err",
    "bruins:", bruins.status === "fulfilled" ? bruins.value.length : "err",
    "celtics:", celtics.status === "fulfilled" ? celtics.value.length : "err",
    "ticketmaster:", tm.status === "fulfilled" ? tm.value.length : TM_KEY ? "err" : "no key");

  // Deduplicate by name+date (sports APIs and TM may overlap)
  const seen = new Set<string>();
  const all: TransitEvent[] = [
    ...(sox.status === "fulfilled" ? sox.value : []),
    ...(bruins.status === "fulfilled" ? bruins.value : []),
    ...(celtics.status === "fulfilled" ? celtics.value : []),
    ...(tm.status === "fulfilled" ? tm.value : []),
  ];

  const events = all
    .filter(e => {
      const key = `${e.name}|${e.startTime?.slice(0, 13)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  return NextResponse.json(events, {
    headers: { "Cache-Control": "public, max-age=1800" },
  });
}
