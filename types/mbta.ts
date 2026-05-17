export interface Prediction {
  id: string;
  predicted: string | null;
  scheduled: string | null;
  delay: number | null;
  directionId: 0 | 1;
  status: string | null;
  scheduleRelationship: string | null;
  headsign: string;
  route: string;
  branch: string;
  stopId: string;
}

export interface Alert {
  id: string;
  header: string;
  effect: string;
  severity: number;
  updatedAt: string;
}

export interface HistoricalBaseline {
  stopId: string;
  directionId: number;
  hour: number;
  dayOfWeek: number;
  avgDelayMinutes: number;
  p75DelayMinutes: number;
  sampleSize: number;
}

export interface Vehicle {
  id: string;
  lat: number;
  lon: number;
  bearing: number;
  speed: number | null;
  status: "IN_TRANSIT_TO" | "STOPPED_AT" | "INCOMING_AT";
  directionId: 0 | 1;
  route: string;
  branch: string;
  headsign: string;
  currentStopId: string | null;
}

export interface TransitEvent {
  id: string;
  name: string;
  venue: string;
  area: string;
  startTime: string;       // ISO 8601
  sport: "MLB" | "NHL" | "NBA" | "EVENT";
  affectedStops: string[]; // stop IDs
  crowdLevel: "medium" | "high" | "very-high";
}

export interface StopInfo {
  id: string;
  name: string;
  section: "Trunk" | "B Branch" | "C Branch" | "D Branch" | "E Branch" | "GLX";
  lat: number;
  lon: number;
  accessible: boolean;
}
