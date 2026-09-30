/// <reference lib="webworker" />
/**
 * Vector-tile mesher. Runs off the main thread: fetches an OpenMapTiles-schema
 * .pbf, and turns it into ready-to-upload typed arrays —
 *   ground:    flat, vertex-colored triangles (land use, parks, water, roads)
 *              emitted in paint order, drawn without depth testing
 *   buildings: extruded, lit prisms with per-face normals and a baked
 *              darkening toward the street for a cheap ambient-occlusion look
 * All positions are relative to the tile center, in world units.
 */
import { VectorTile, classifyRings, type VectorTileFeature } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import earcut from "earcut";
import type { TileRequest, TileResult, MeshArrays } from "./tileTypes";

declare const self: DedicatedWorkerGlobalScope;

type RGB = [number, number, number];
type Pt = { x: number; y: number };

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ── Palette ──────────────────────────────────────────────────────────────

const C = {
  land:       hex("#EFE8D6"),
  commercial: hex("#EFE4D3"),
  campus:     hex("#F7E3DA"),
  hospital:   hex("#FBE0E0"),
  grass:      hex("#B6E39B"),
  park:       hex("#A6DC8A"),
  wood:       hex("#8FCF7C"),
  pitch:      hex("#C5EBA0"),
  cemetery:   hex("#BCE0A9"),
  sand:       hex("#F6E5AE"),
  wetland:    hex("#B9E2CB"),
  runway:     hex("#DCD8E6"),
  apron:      hex("#E7E3EC"),
  water:      hex("#6EC6F2"),
  motorway:   hex("#FFD27A"),
  major:      hex("#FFFFFF"),
  minor:      hex("#FBF8F1"),
  rail:       hex("#D6CEC0"),
};

const BUILDING_PALETTE: RGB[] = [
  "#FFFFFF", "#FFF6E6", "#FFE6CC", "#FFD9C7", "#E9EEFF",
  "#E1F4EE", "#F2E6FF", "#FFF2BF", "#FDE8EF",
].map(hex);
const TOWER_PALETTE: RGB[] = ["#BFD5FF", "#A9C6F7", "#C9D9F2", "#B4E3F0"].map(hex);

function landuseColor(cls: string): RGB | null {
  switch (cls) {
    case "commercial": case "retail": case "industrial": case "railway": return C.commercial;
    case "university": case "college": case "school": case "kindergarten": case "library": return C.campus;
    case "hospital": return C.hospital;
    case "cemetery": return C.cemetery;
    case "pitch": case "playground": case "stadium": case "zoo": case "theme_park": return C.pitch;
    default: return null; // residential etc. show the base land color
  }
}

function landcoverColor(cls: string): RGB | null {
  switch (cls) {
    case "grass": case "farmland": return C.grass;
    case "wood": return C.wood;
    case "sand": return C.sand;
    case "wetland": return C.wetland;
    case "rock": case "ice": return null;
    default: return C.grass;
  }
}

/** Road style by class; widths in meters of mercator ground at z14, scaled per zoom below. */
function roadStyle(cls: string, z: number): { w: number; c: RGB; major: boolean } | null {
  switch (cls) {
    case "motorway": return { w: 26, c: C.motorway, major: true };
    case "trunk": return { w: 22, c: C.motorway, major: true };
    case "primary": return z >= 11 ? { w: 18, c: C.major, major: true } : null;
    case "secondary": return z >= 13 ? { w: 15, c: C.major, major: true } : null;
    case "tertiary": return z >= 13 ? { w: 13, c: C.major, major: false } : null;
    case "minor": case "busway": return z >= 13 ? { w: 10, c: C.minor, major: false } : null;
    case "service": return z >= 14 ? { w: 6, c: C.minor, major: false } : null;
    case "rail": return z >= 13 ? { w: 4, c: C.rail, major: false } : null;
    default: return null;
  }
}

// ── Geometry buffers ─────────────────────────────────────────────────────

/** Vertex colors are read as linear; the palette above is authored in sRGB. */
function toLinear(v: number): number {
  const c = Math.min(1, v / 255);
  const lin = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return Math.round(lin * 255);
}

class Buf {
  pos: number[] = [];
  col: number[] = [];
  nor: number[] = [];
  idx: number[] = [];
  get count() { return this.pos.length / 3; }

  vert(x: number, y: number, z: number, c: RGB, k = 1, n?: [number, number, number]) {
    this.pos.push(x, y, z);
    this.col.push(toLinear(c[0] * k), toLinear(c[1] * k), toLinear(c[2] * k));
    if (n) this.nor.push(n[0], n[1], n[2]);
  }

  append(o: Buf) {
    const base = this.count;
    for (const v of o.pos) this.pos.push(v);
    for (const v of o.col) this.col.push(v);
    for (const v of o.nor) this.nor.push(v);
    for (const i of o.idx) this.idx.push(i + base);
  }

  toArrays(withNormals: boolean): MeshArrays | null {
    if (this.idx.length === 0) return null;
    return {
      position: new Float32Array(this.pos),
      color: new Uint8Array(this.col),
      normal: withNormals ? new Float32Array(this.nor) : null,
      index: new Uint32Array(this.idx),
    };
  }
}

// ── Clipping (to the exact tile square, so neighbors never overlap) ─────

function clipRing(ring: Pt[], extent: number): Pt[] {
  let out = ring;
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [p => p.x >= 0, (a, b) => ({ x: 0, y: a.y + (b.y - a.y) * (0 - a.x) / (b.x - a.x) })],
    [p => p.x <= extent, (a, b) => ({ x: extent, y: a.y + (b.y - a.y) * (extent - a.x) / (b.x - a.x) })],
    [p => p.y >= 0, (a, b) => ({ x: a.x + (b.x - a.x) * (0 - a.y) / (b.y - a.y), y: 0 })],
    [p => p.y <= extent, (a, b) => ({ x: a.x + (b.x - a.x) * (extent - a.y) / (b.y - a.y), y: extent })],
  ];
  for (const [inside, cut] of edges) {
    if (out.length === 0) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) {
        if (!pi) out.push(cut(prev, cur));
        out.push(cur);
      } else if (pi) {
        out.push(cut(prev, cur));
      }
    }
  }
  return out;
}

function clipSegment(a: Pt, b: Pt, extent: number): [Pt, Pt] | null {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x, extent - a.x, a.y, extent - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
    else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
}

function signedArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  return a / 2;
}

/** Drop the duplicated closing vertex MVT rings carry. */
function openRing(ring: Pt[]): Pt[] {
  if (ring.length > 1) {
    const f = ring[0], l = ring[ring.length - 1];
    if (f.x === l.x && f.y === l.y) return ring.slice(0, -1);
  }
  return ring;
}

// ── Emitters ─────────────────────────────────────────────────────────────

interface Ctx { extent: number; size: number; }

/** Tile pixel → tile-local world coordinate. */
function lx(ctx: Ctx, px: number) { return (px / ctx.extent - 0.5) * ctx.size; }

function fillPolygons(buf: Buf, ctx: Ctx, feature: VectorTileFeature, color: RGB) {
  const polys = classifyRings(feature.loadGeometry());
  for (const poly of polys) {
    const rings = poly.map(r => clipRing(openRing(r), ctx.extent)).filter(r => r.length >= 3);
    if (rings.length === 0) continue;
    const flat: number[] = [];
    const holes: number[] = [];
    rings.forEach((r, i) => {
      if (i > 0) holes.push(flat.length / 2);
      for (const p of r) flat.push(p.x, p.y);
    });
    const tris = earcut(flat, holes.length ? holes : undefined);
    if (tris.length === 0) continue;
    const base = buf.count;
    for (let i = 0; i < flat.length; i += 2) buf.vert(lx(ctx, flat[i]), 0, lx(ctx, flat[i + 1]), color);
    for (const t of tris) buf.idx.push(base + t);
  }
}

function strokeLines(buf: Buf, ctx: Ctx, feature: VectorTileFeature, widthWorld: number, color: RGB) {
  const hw = widthWorld / 2;
  for (const line of feature.loadGeometry()) {
    for (let i = 0; i < line.length - 1; i++) {
      const seg = clipSegment(line[i], line[i + 1], ctx.extent);
      if (!seg) continue;
      const ax = lx(ctx, seg[0].x), az = lx(ctx, seg[0].y);
      const bx = lx(ctx, seg[1].x), bz = lx(ctx, seg[1].y);
      let dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      dx /= len; dz /= len;
      // square caps overlap at joints so bends have no notches
      const ex = dx * hw, ez = dz * hw;
      const nx = -dz * hw, nz = dx * hw;
      const base = buf.count;
      buf.vert(ax - ex + nx, 0, az - ez + nz, color);
      buf.vert(ax - ex - nx, 0, az - ez - nz, color);
      buf.vert(bx + ex - nx, 0, bz + ez - nz, color);
      buf.vert(bx + ex + nx, 0, bz + ez + nz, color);
      buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
}

// Height scale: meters → world units (1 unit = 20 mercator m), ×1.35 because
// mercator stretches ground distances by 1/cos(lat) at Boston — keeps buildings proportional.
const HEIGHT_SCALE = 0.05 * 1.35;
const MIN_HEIGHT = 0.35;

function hash(n: number) {
  n = (n ^ 61) ^ (n >>> 16);
  n = n + (n << 3);
  n = n ^ (n >>> 4);
  n = Math.imul(n, 0x27d4eb2d);
  return (n ^ (n >>> 15)) >>> 0;
}

function extrude(buf: Buf, ctx: Ctx, feature: VectorTileFeature, seed: number) {
  const p = feature.properties;
  if (p.hide_3d === true || p.hide_3d === "true") return;
  const hMeters = typeof p.render_height === "number" ? p.render_height : 8;
  const minMeters = typeof p.render_min_height === "number" ? p.render_min_height : 0;
  const top = Math.max(hMeters * HEIGHT_SCALE, MIN_HEIGHT);
  const bottom = Math.min(minMeters * HEIGHT_SCALE, top - 0.05);

  const h = hash(seed);
  const color = hMeters > 55
    ? TOWER_PALETTE[h % TOWER_PALETTE.length]
    : BUILDING_PALETTE[h % BUILDING_PALETTE.length];
  const E = ctx.extent;

  for (const poly of classifyRings(feature.loadGeometry())) {
    const rings = poly.map(r => clipRing(openRing(r), E)).filter(r => r.length >= 3);
    if (rings.length === 0) continue;

    // Roof
    const flat: number[] = [];
    const holes: number[] = [];
    rings.forEach((r, i) => {
      if (i > 0) holes.push(flat.length / 2);
      for (const pt of r) flat.push(pt.x, pt.y);
    });
    const tris = earcut(flat, holes.length ? holes : undefined);
    const base = buf.count;
    for (let i = 0; i < flat.length; i += 2) buf.vert(lx(ctx, flat[i]), top, lx(ctx, flat[i + 1]), color, 1.02, [0, 1, 0]);
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i], b = tris[i + 1], c = tris[i + 2];
      // face up: y of (b-a)×(c-a) must be positive
      const e1x = flat[b * 2] - flat[a * 2], e1z = flat[b * 2 + 1] - flat[a * 2 + 1];
      const e2x = flat[c * 2] - flat[a * 2], e2z = flat[c * 2 + 1] - flat[a * 2 + 1];
      if (e1z * e2x - e1x * e2z >= 0) buf.idx.push(base + a, base + b, base + c);
      else buf.idx.push(base + a, base + c, base + b);
    }

    // Walls
    rings.forEach((ring, ri) => {
      const ccw = signedArea(ring) > 0;
      // outer rings face away from their interior; holes face into the courtyard
      const outwardSign = (ccw ? 1 : -1) * (ri === 0 ? 1 : -1);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        // skip walls on the tile cut line — they'd sit inside the neighbor's half
        if ((a.x === b.x && (a.x <= 0 || a.x >= E)) || (a.y === b.y && (a.y <= 0 || a.y >= E))) continue;
        const ax = lx(ctx, a.x), az = lx(ctx, a.y), bx = lx(ctx, b.x), bz = lx(ctx, b.y);
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz);
        if (len < 1e-4) continue;
        const nx = (dz / len) * outwardSign, nz = (-dx / len) * outwardSign;
        const n: [number, number, number] = [nx, 0, nz];
        const v = buf.count;
        buf.vert(ax, bottom, az, color, bottom > 0.01 ? 0.86 : 0.7, n);
        buf.vert(bx, bottom, bz, color, bottom > 0.01 ? 0.86 : 0.7, n);
        buf.vert(bx, top, bz, color, 0.95, n);
        buf.vert(ax, top, az, color, 0.95, n);
        // winding: (b0-a0)×(b1-a0) points along (-dz, 0, dx)
        const natural = -dz * nx + dx * nz > 0;
        if (natural) buf.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
        else buf.idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
      }
    });
  }
}

// ── Tile → meshes ────────────────────────────────────────────────────────

function build(data: ArrayBuffer, req: TileRequest): TileResult {
  const tile = new VectorTile(new PbfReader(new Uint8Array(data)));
  const L = tile.layers;
  const extent = Object.values(L)[0]?.extent ?? 4096;
  const ctx: Ctx = { extent, size: req.size };
  // one mercator meter in world units at this tile size, for road widths
  const metersToWorld = 0.05;
  // widen roads at coarse zooms so they stay a pixel or two wide on screen
  const roadScale = Math.max(1, Math.pow(2, 14 - req.z) * 0.4);

  const result: TileResult = { id: req.id, ground: null, buildings: null };

  if (req.ground) {
    // Opaque base square so this tile fully covers coarser tiles beneath it
    const base = new Buf();
    const h = req.size / 2;
    base.vert(-h, 0, -h, C.land); base.vert(h, 0, -h, C.land); base.vert(h, 0, h, C.land); base.vert(-h, 0, h, C.land);
    base.idx.push(0, 1, 2, 0, 2, 3);
    const land = new Buf(), green = new Buf(), air = new Buf(), water = new Buf(), minor = new Buf(), major = new Buf();
    const each = (name: string, fn: (f: VectorTileFeature) => void) => {
      const layer = L[name];
      if (!layer) return;
      for (let i = 0; i < layer.length; i++) fn(layer.feature(i));
    };
    each("landuse", f => {
      const c = landuseColor(String(f.properties.class ?? ""));
      if (c && f.type === 3) fillPolygons(land, ctx, f, c);
    });
    each("park", f => { if (f.type === 3) fillPolygons(green, ctx, f, C.park); });
    each("landcover", f => {
      const c = landcoverColor(String(f.properties.class ?? ""));
      if (c && f.type === 3) fillPolygons(green, ctx, f, c);
    });
    each("aeroway", f => {
      const cls = String(f.properties.class ?? "");
      if (f.type === 3) fillPolygons(air, ctx, f, cls === "runway" || cls === "taxiway" ? C.runway : C.apron);
      else if (f.type === 2 && (cls === "runway" || cls === "taxiway")) strokeLines(air, ctx, f, (cls === "runway" ? 45 : 20) * metersToWorld * roadScale, C.runway);
    });
    each("water", f => { if (f.type === 3 && f.properties.class !== "swimming_pool") fillPolygons(water, ctx, f, C.water); });
    each("waterway", f => {
      if (f.type !== 2 || f.properties.brunnel === "tunnel") return;
      const w = f.properties.class === "river" ? 30 : f.properties.class === "canal" ? 18 : 8;
      strokeLines(water, ctx, f, w * metersToWorld * roadScale, C.water);
    });
    each("transportation", f => {
      if (f.type !== 2) return;
      if (f.properties.brunnel === "tunnel") return;
      const s = roadStyle(String(f.properties.class ?? ""), req.z);
      if (!s) return;
      strokeLines(s.major ? major : minor, ctx, f, s.w * metersToWorld * roadScale, s.c);
    });
    const ground = new Buf();
    for (const b of [base, land, green, air, water, minor, major]) ground.append(b);
    result.ground = ground.toArrays(false);
  }

  if (req.buildings) {
    const b = new Buf();
    const layer = L.building;
    if (layer) {
      const seedBase = req.x * 7919 + req.y * 104729;
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        if (f.type === 3) extrude(b, ctx, f, (f.id ?? i) + seedBase);
      }
    }
    result.buildings = b.toArrays(true);
  }

  return result;
}

self.onmessage = async (e: MessageEvent<TileRequest>) => {
  const req = e.data;
  try {
    const res = await fetch(req.url);
    if (!res.ok) throw new Error(`${res.status}`);
    const out = build(await res.arrayBuffer(), req);
    const transfer: Transferable[] = [];
    for (const m of [out.ground, out.buildings]) {
      if (!m) continue;
      transfer.push(m.position.buffer, m.color.buffer, m.index.buffer);
      if (m.normal) transfer.push(m.normal.buffer);
    }
    self.postMessage(out, transfer);
  } catch {
    self.postMessage({ id: req.id, ground: null, buildings: null, failed: true } satisfies TileResult);
  }
};
