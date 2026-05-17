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

export interface StopInfo {
  id: string;
  name: string;
  section: "Trunk" | "B Branch" | "C Branch" | "D Branch" | "E Branch" | "GLX";
  lat: number;
  lon: number;
  accessible: boolean;
}
