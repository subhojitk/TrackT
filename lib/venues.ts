export interface StopRef { stopId: string; lineId: string; }

export interface VenueMeta {
  name: string;
  area: string;
  affectedStops: StopRef[];
  crowdLevel: "medium" | "high" | "very-high";
}

function gl(...stopIds: string[]): StopRef[] {
  return stopIds.map(stopId => ({ stopId, lineId: "Green" }));
}

export const VENUES: Record<string, VenueMeta> = {
  // ── Sports ──
  "Fenway Park": {
    name: "Fenway Park",
    area: "Fenway / Kenmore",
    affectedStops: gl("place-fenwy", "place-kencl"),
    crowdLevel: "very-high",
  },
  "TD Garden": {
    name: "TD Garden",
    area: "North Station",
    affectedStops: gl("place-north", "place-haecl"),
    crowdLevel: "very-high",
  },
  "Agganis Arena": {
    name: "Agganis Arena",
    area: "BU / Kenmore",
    affectedStops: gl("place-buest", "place-bucen"),
    crowdLevel: "high",
  },
  "Boston College Alumni Stadium": {
    name: "Boston College Alumni Stadium",
    area: "Boston College",
    affectedStops: gl("place-lake"),
    crowdLevel: "high",
  },

  // ── Concert venues ──
  "MGM Music Hall at Fenway": {
    name: "MGM Music Hall at Fenway",
    area: "Fenway / Kenmore",
    affectedStops: gl("place-fenwy", "place-kencl"),
    crowdLevel: "high",
  },
  "House of Blues Boston": {
    name: "House of Blues Boston",
    area: "Fenway / Kenmore",
    affectedStops: gl("place-fenwy", "place-kencl"),
    crowdLevel: "high",
  },
  "Paradise Rock Club": {
    name: "Paradise Rock Club",
    area: "Allston / BU",
    affectedStops: gl("place-harvd", "place-grigg"),
    crowdLevel: "medium",
  },
  "Brighton Music Hall": {
    name: "Brighton Music Hall",
    area: "Allston / Harvard Ave",
    affectedStops: gl("place-harvd"),
    crowdLevel: "medium",
  },
  "Roadrunner": {
    name: "Roadrunner",
    area: "Allston",
    affectedStops: gl("place-harvd", "place-kencl"),
    crowdLevel: "high",
  },
  "The Sinclair": {
    name: "The Sinclair",
    area: "Allston / Harvard Ave",
    affectedStops: gl("place-harvd"),
    crowdLevel: "medium",
  },

  // ── Theaters & Arts ──
  "Boch Center Wang Theatre": {
    name: "Boch Center Wang Theatre",
    area: "Downtown / Boylston",
    affectedStops: gl("place-boyls", "place-armnl"),
    crowdLevel: "high",
  },
  "Boch Center Shubert Theatre": {
    name: "Boch Center Shubert Theatre",
    area: "Downtown / Boylston",
    affectedStops: gl("place-boyls", "place-armnl"),
    crowdLevel: "medium",
  },
  "Boston Opera House": {
    name: "Boston Opera House",
    area: "Downtown / Boylston",
    affectedStops: gl("place-boyls", "place-pktrm"),
    crowdLevel: "medium",
  },
  "Orpheum Theatre": {
    name: "Orpheum Theatre",
    area: "Downtown / Park Street",
    affectedStops: gl("place-pktrm", "place-gover"),
    crowdLevel: "high",
  },
  "Wilbur Theatre": {
    name: "Wilbur Theatre",
    area: "Downtown / Boylston",
    affectedStops: gl("place-boyls", "place-armnl"),
    crowdLevel: "medium",
  },
  "Symphony Hall": {
    name: "Symphony Hall",
    area: "Symphony",
    affectedStops: gl("place-symcl", "place-prmnl"),
    crowdLevel: "medium",
  },
  "Cutler Majestic Theatre": {
    name: "Cutler Majestic Theatre",
    area: "Boylston / Tremont",
    affectedStops: gl("place-boyls", "place-armnl"),
    crowdLevel: "medium",
  },
  "Huntington Theatre": {
    name: "Huntington Theatre",
    area: "Symphony / Prudential",
    affectedStops: gl("place-symcl", "place-prmnl"),
    crowdLevel: "medium",
  },

  // ── Comedy ──
  "Laugh Boston": {
    name: "Laugh Boston",
    area: "Seaport (Boylston area)",
    affectedStops: gl("place-boyls"),
    crowdLevel: "medium",
  },
  "ImprovBoston": {
    name: "ImprovBoston",
    area: "Central Square / Inman",
    affectedStops: gl("place-lech"),
    crowdLevel: "medium",
  },

  // ── Arenas / Multi-use ──
  "Warrior Ice Arena": {
    name: "Warrior Ice Arena",
    area: "Brighton / BU",
    affectedStops: gl("place-lake", "place-sougr"),
    crowdLevel: "medium",
  },
};

// MLB team ID 111 = Boston Red Sox
export const RED_SOX_TEAM_ID = 111;
// NHL team abbrev = BOS (Bruins)
export const BRUINS_ABBREV = "BOS";
// NBA ESPN team slug = boston-celtics
export const CELTICS_ESPN_SLUG = "boston-celtics";
