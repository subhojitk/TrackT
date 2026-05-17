export type Mode = "subway" | "commuter_rail" | "bus" | "ferry";

export interface Line {
  id: string;
  name: string;
  shortName: string;
  mode: Mode;
  color: string;
  textColor: "white" | "black";
  routes: string[];
  terminus: [string, string];
  mapCenter: [number, number];
  mapZoom: number;
}

export const LINES: Line[] = [
  // ── Subway ────────────────────────────────────────────────────────────
  {
    id: "Red", name: "Red Line", shortName: "Red", mode: "subway",
    color: "#DA291C", textColor: "white", routes: ["Red"],
    terminus: ["Alewife", "Braintree / Ashmont"],
    mapCenter: [42.373, -71.119], mapZoom: 12,
  },
  {
    id: "Orange", name: "Orange Line", shortName: "Org", mode: "subway",
    color: "#ED8B00", textColor: "white", routes: ["Orange"],
    terminus: ["Oak Grove", "Forest Hills"],
    mapCenter: [42.348, -71.091], mapZoom: 12,
  },
  {
    id: "Blue", name: "Blue Line", shortName: "Blue", mode: "subway",
    color: "#003DA5", textColor: "white", routes: ["Blue"],
    terminus: ["Bowdoin", "Wonderland"],
    mapCenter: [42.366, -71.042], mapZoom: 12,
  },
  {
    id: "Green", name: "Green Line", shortName: "GL", mode: "subway",
    color: "#00843D", textColor: "white",
    routes: ["Green-B", "Green-C", "Green-D", "Green-E"],
    terminus: ["Medford/Tufts", "Boston College / Heath St / Riverside"],
    mapCenter: [42.356, -71.1], mapZoom: 12,
  },
  {
    id: "Green-B", name: "Green Line B", shortName: "B", mode: "subway",
    color: "#00843D", textColor: "white", routes: ["Green-B"],
    terminus: ["Government Center", "Boston College"],
    mapCenter: [42.348, -71.127], mapZoom: 13,
  },
  {
    id: "Green-C", name: "Green Line C", shortName: "C", mode: "subway",
    color: "#00843D", textColor: "white", routes: ["Green-C"],
    terminus: ["Government Center", "Cleveland Circle"],
    mapCenter: [42.345, -71.12], mapZoom: 13,
  },
  {
    id: "Green-D", name: "Green Line D", shortName: "D", mode: "subway",
    color: "#00843D", textColor: "white", routes: ["Green-D"],
    terminus: ["Government Center", "Riverside"],
    mapCenter: [42.346, -71.14], mapZoom: 12,
  },
  {
    id: "Green-E", name: "Green Line E", shortName: "E", mode: "subway",
    color: "#00843D", textColor: "white", routes: ["Green-E"],
    terminus: ["Medford/Tufts", "Heath Street"],
    mapCenter: [42.347, -71.09], mapZoom: 13,
  },
  {
    id: "Mattapan", name: "Mattapan Line", shortName: "Mat", mode: "subway",
    color: "#DA291C", textColor: "white", routes: ["Mattapan"],
    terminus: ["Ashmont", "Mattapan"],
    mapCenter: [42.284, -71.064], mapZoom: 14,
  },

  // ── Commuter Rail ─────────────────────────────────────────────────────
  {
    id: "CR-Fairmount", name: "Fairmount Line", shortName: "Fairmount", mode: "commuter_rail",
    color: "#80276C", textColor: "white", routes: ["CR-Fairmount"],
    terminus: ["South Station", "Readville"],
    mapCenter: [42.308, -71.092], mapZoom: 12,
  },
  {
    id: "CR-Fitchburg", name: "Fitchburg Line", shortName: "Fitchburg", mode: "commuter_rail",
    color: "#80276C", textColor: "white", routes: ["CR-Fitchburg"],
    terminus: ["North Station", "Wachusett"],
    mapCenter: [42.44, -71.52], mapZoom: 10,
  },
  {
    id: "CR-Franklin", name: "Franklin / Foxboro Line", shortName: "Franklin", mode: "commuter_rail",
    color: "#80276C", textColor: "white", routes: ["CR-Franklin"],
    terminus: ["South Station", "Foxboro / Franklin"],
    mapCenter: [42.22, -71.25], mapZoom: 10,
  },
  {
    id: "CR-Greenbush", name: "Greenbush Line", shortName: "Greenbush", mode: "commuter_rail",
    color: "#80276C", textColor: "white", routes: ["CR-Greenbush"],
    terminus: ["South Station", "Greenbush"],
    mapCenter: [42.22, -70.87], mapZoom: 10,
  },
  {
    id: "CR-Haverhill", name: "Haverhill Line", shortName: "Haverhill", mode: "commuter_rail",
    color: "#80276C", textColor: "white", routes: ["CR-Haverhill"],
    terminus: ["North Station", "Haverhill"],
    mapCenter: [42.56, -71.09], mapZoom: 10,
  },
  {
    id: "CR-Kingston", name: "Kingston / Plymouth Line", shortName: "Kingston", mode: "commuter_rail",
    color: "#80276C", textColor: "white", routes: ["CR-Kingston"],
    terminus: ["South Station", "Kingston / Plymouth"],
    mapCenter: [42.12, -70.85], mapZoom: 10,
  },
  {
    id: "CR-Lowell", name: "Lowell Line", shortName: "Lowell", mode: "commuter_rail",
    color: "#80276C", textColor: "white", routes: ["CR-Lowell"],
    terminus: ["North Station", "Lowell"],
    mapCenter: [42.52, -71.22], mapZoom: 10,
  },
  {
    id: "CR-Middleborough", name: "Middleborough / Lakeville Line", shortName: "Middleboro", mode: "commuter_rail",
    color: "#80276C", textColor: "white", routes: ["CR-Middleborough"],
    terminus: ["South Station", "Middleborough / Lakeville"],
    mapCenter: [42.1, -70.93], mapZoom: 10,
  },
  {
    id: "CR-Needham", name: "Needham Line", shortName: "Needham", mode: "commuter_rail",
    color: "#80276C", textColor: "white", routes: ["CR-Needham"],
    terminus: ["South Station", "Needham Heights"],
    mapCenter: [42.27, -71.2], mapZoom: 11,
  },
  {
    id: "CR-Newburyport", name: "Newburyport / Rockport Line", shortName: "Newburyport", mode: "commuter_rail",
    color: "#80276C", textColor: "white", routes: ["CR-Newburyport"],
    terminus: ["North Station", "Newburyport / Rockport"],
    mapCenter: [42.65, -70.85], mapZoom: 10,
  },
  {
    id: "CR-Providence", name: "Providence / Stoughton Line", shortName: "Providence", mode: "commuter_rail",
    color: "#80276C", textColor: "white", routes: ["CR-Providence"],
    terminus: ["South Station", "Providence / Stoughton"],
    mapCenter: [42.05, -71.28], mapZoom: 10,
  },
  {
    id: "CR-Worcester", name: "Worcester / Framingham Line", shortName: "Worcester", mode: "commuter_rail",
    color: "#80276C", textColor: "white", routes: ["CR-Worcester"],
    terminus: ["South Station", "Worcester"],
    mapCenter: [42.27, -71.47], mapZoom: 10,
  },

  // ── Bus ───────────────────────────────────────────────────────────────
  {
    id: "1", name: "Route 1", shortName: "1", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["1"],
    terminus: ["Harvard", "Dudley"],
    mapCenter: [42.368, -71.11], mapZoom: 13,
  },
  {
    id: "7", name: "Route 7", shortName: "7", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["7"],
    terminus: ["Otis & Summer", "City Point"],
    mapCenter: [42.351, -71.053], mapZoom: 13,
  },
  {
    id: "9", name: "Route 9", shortName: "9", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["9"],
    terminus: ["Copley Square", "City Point"],
    mapCenter: [42.348, -71.073], mapZoom: 13,
  },
  {
    id: "15", name: "Route 15", shortName: "15", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["15"],
    terminus: ["Kane Square", "Ruggles"],
    mapCenter: [42.322, -71.057], mapZoom: 13,
  },
  {
    id: "22", name: "Route 22", shortName: "22", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["22"],
    terminus: ["Ashmont", "Ruggles"],
    mapCenter: [42.303, -71.067], mapZoom: 13,
  },
  {
    id: "23", name: "Route 23", shortName: "23", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["23"],
    terminus: ["Ashmont", "Ruggles"],
    mapCenter: [42.307, -71.071], mapZoom: 13,
  },
  {
    id: "28", name: "Route 28", shortName: "28", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["28"],
    terminus: ["Mattapan", "Ruggles"],
    mapCenter: [42.299, -71.077], mapZoom: 12,
  },
  {
    id: "32", name: "Route 32", shortName: "32", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["32"],
    terminus: ["Wolcott Square", "Forest Hills"],
    mapCenter: [42.3, -71.115], mapZoom: 13,
  },
  {
    id: "39", name: "Route 39", shortName: "39", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["39"],
    terminus: ["Forest Hills", "Back Bay Station"],
    mapCenter: [42.334, -71.103], mapZoom: 13,
  },
  {
    id: "57", name: "Route 57", shortName: "57", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["57"],
    terminus: ["Kenmore", "Watertown Yard"],
    mapCenter: [42.35, -71.15], mapZoom: 12,
  },
  {
    id: "66", name: "Route 66", shortName: "66", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["66"],
    terminus: ["Harvard", "Dudley"],
    mapCenter: [42.357, -71.115], mapZoom: 13,
  },
  {
    id: "71", name: "Route 71", shortName: "71", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["71"],
    terminus: ["Watertown Yard", "Harvard"],
    mapCenter: [42.369, -71.147], mapZoom: 13,
  },
  {
    id: "73", name: "Route 73", shortName: "73", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["73"],
    terminus: ["Waverley", "Harvard"],
    mapCenter: [42.374, -71.156], mapZoom: 13,
  },
  {
    id: "77", name: "Route 77", shortName: "77", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["77"],
    terminus: ["Arlington Heights", "Harvard"],
    mapCenter: [42.388, -71.135], mapZoom: 12,
  },
  {
    id: "111", name: "Route 111", shortName: "111", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["111"],
    terminus: ["Woodlawn", "Haymarket"],
    mapCenter: [42.393, -71.021], mapZoom: 12,
  },
  {
    id: "116", name: "Route 116", shortName: "116", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["116"],
    terminus: ["Wonderland", "Maverick"],
    mapCenter: [42.397, -70.991], mapZoom: 13,
  },
  {
    id: "117", name: "Route 117", shortName: "117", mode: "bus",
    color: "#FFC72C", textColor: "black", routes: ["117"],
    terminus: ["Wonderland", "Maverick"],
    mapCenter: [42.395, -70.996], mapZoom: 13,
  },
  {
    id: "SL1", name: "Silver Line 1", shortName: "SL1", mode: "bus",
    color: "#7C878E", textColor: "white", routes: ["741"],
    terminus: ["Logan Airport", "South Station"],
    mapCenter: [42.352, -71.047], mapZoom: 13,
  },
  {
    id: "SL2", name: "Silver Line 2", shortName: "SL2", mode: "bus",
    color: "#7C878E", textColor: "white", routes: ["742"],
    terminus: ["Design Center", "South Station"],
    mapCenter: [42.348, -71.044], mapZoom: 13,
  },
  {
    id: "SL4", name: "Silver Line 4", shortName: "SL4", mode: "bus",
    color: "#7C878E", textColor: "white", routes: ["751"],
    terminus: ["South Station", "Dudley"],
    mapCenter: [42.341, -71.069], mapZoom: 13,
  },
  {
    id: "SL5", name: "Silver Line 5", shortName: "SL5", mode: "bus",
    color: "#7C878E", textColor: "white", routes: ["749"],
    terminus: ["Downtown", "Dudley"],
    mapCenter: [42.352, -71.066], mapZoom: 13,
  },

  // ── Ferry ─────────────────────────────────────────────────────────────
  {
    id: "Boat-F1", name: "Hingham / Hull Ferry", shortName: "F1", mode: "ferry",
    color: "#008EAA", textColor: "white", routes: ["Boat-F1"],
    terminus: ["Long Wharf", "Hingham / Hull"],
    mapCenter: [42.28, -70.93], mapZoom: 11,
  },
  {
    id: "Boat-F4", name: "Charlestown Ferry", shortName: "F4", mode: "ferry",
    color: "#008EAA", textColor: "white", routes: ["Boat-F4"],
    terminus: ["Long Wharf North", "Charlestown"],
    mapCenter: [42.364, -71.054], mapZoom: 14,
  },
  {
    id: "Boat-F2H", name: "Hull / Logan Ferry", shortName: "F2H", mode: "ferry",
    color: "#008EAA", textColor: "white", routes: ["Boat-F2H"],
    terminus: ["Rowe's Wharf", "Hull"],
    mapCenter: [42.318, -70.92], mapZoom: 11,
  },
];

export const LINES_BY_MODE: Record<Mode, Line[]> = {
  subway: LINES.filter(l => l.mode === "subway"),
  commuter_rail: LINES.filter(l => l.mode === "commuter_rail"),
  bus: LINES.filter(l => l.mode === "bus"),
  ferry: LINES.filter(l => l.mode === "ferry"),
};

export function getLine(id: string): Line | undefined {
  return LINES.find(l => l.id === id);
}

export function getRouteIdsForLine(id: string): string[] {
  return getLine(id)?.routes ?? [id];
}

export function inferLineId(mbtaRouteId: string): string {
  if (mbtaRouteId.startsWith("Green-")) return "Green";
  return mbtaRouteId;
}
