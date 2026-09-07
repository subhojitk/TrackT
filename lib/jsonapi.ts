/** Minimal typing for the JSON:API envelopes returned by the MBTA V3 API. */

export type Attr = string | number | boolean | null | undefined;

export interface ResourceRef {
  id: string;
  type: string;
}

export interface Resource {
  id: string;
  type: string;
  attributes: Record<string, Attr>;
  relationships?: Record<string, { data?: ResourceRef | ResourceRef[] | null }>;
}

export interface Document {
  data?: Resource[];
  included?: Resource[];
}

export interface SingleDocument {
  data?: Resource;
}

/** Single related resource id, or null when absent / to-many. */
export function relId(res: Resource, name: string): string | null {
  const data = res.relationships?.[name]?.data;
  if (!data || Array.isArray(data)) return null;
  return data.id;
}

export function str(v: Attr): string | null {
  return typeof v === "string" ? v : null;
}

export function num(v: Attr): number | null {
  return typeof v === "number" ? v : null;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
