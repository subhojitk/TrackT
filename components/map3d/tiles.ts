import * as THREE from "three";
import { tileToWorld, tileWorldSize, worldToTile } from "@/lib/geo";
import type { MeshArrays, TileRequest, TileResult } from "./tileTypes";

/**
 * OpenFreeMap serves OpenMapTiles-schema vector tiles with no API key. The
 * TileJSON points at a dated planet build, so resolve it at runtime.
 */
const TILEJSON = "https://tiles.openfreemap.org/planet";
export const TILE_ATTRIBUTION = "© OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors";

const MIN_ZOOM = 8;
const MAX_ZOOM = 13;          // ground detail tops out here — z13 already has every street
const BUILDING_ZOOM = 14;     // buildings only exist at z14 in this schema
const DETAIL_RADIUS = 3;      // 7×7 ground ring at the active zoom
const HORIZON_RADIUS = 2;     // 5×5 ring three zooms coarser, for tilted views
const BUILDING_MAX_HEIGHT = 520; // camera height above which buildings aren't streamed
const MAX_GROUND = 260;
const MAX_BUILDINGS = 90;
const MAX_IN_FLIGHT = 10;

const GROUND_FADE = 3.5;      // opacity per second
const GROW_TIME = 0.9;        // seconds for a block of buildings to rise

interface GroundTile {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null;
  z: number; x: number; y: number;
  cx: number; cz: number; size: number;
  lastUsed: number;
  state: "queued" | "loading" | "ready" | "failed";
}

interface BuildingTile {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> | null;
  x: number; y: number;
  cx: number; cz: number; size: number;
  lastUsed: number;
  grow: number;
  state: "queued" | "loading" | "ready" | "failed";
}

interface Job {
  id: number;
  kind: "ground" | "buildings";
  key: string;
  z: number; x: number; y: number;
  cx: number; cz: number; size: number;
}

interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

function easeOutBack(t: number) {
  const c1 = 1.4, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function toGeometry(m: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.position, 3));
  g.setAttribute("color", new THREE.BufferAttribute(m.color, 3, true));
  if (m.normal) g.setAttribute("normal", new THREE.BufferAttribute(m.normal, 3));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Streams stylized vector tiles into two groups:
 *   ground    — flat colored land/water/roads, drawn first with no depth test
 *               (coarser zooms paint underneath finer ones via renderOrder)
 *   buildings — lit extruded blocks that "grow" out of the ground on arrival
 * Meshing happens in a small worker pool so the frame loop never stalls.
 */
export class VectorWorld {
  readonly ground = new THREE.Group();
  readonly buildings = new THREE.Group();

  private groundTiles = new Map<string, GroundTile>();
  private buildingTiles = new Map<string, BuildingTile>();
  private buildingMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  private template: string | null = null;
  private workers: Worker[] = [];
  private nextWorker = 0;
  private nextId = 1;
  private queue: Job[] = [];
  private inFlight = new Map<number, Job>();
  private focus = { x: 0, z: 0 };
  private disposed = false;

  constructor() {
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL("./tile.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<TileResult>) => this.onResult(e.data);
      this.workers.push(w);
    }
    fetch(TILEJSON)
      .then(r => r.json())
      .then((j: { tiles?: string[] }) => { if (!this.disposed && j.tiles?.[0]) this.template = j.tiles[0]; })
      .catch(() => { /* leave the base plane; routes and trains still render */ });
  }

  /** Pick a ground zoom so one tile spans roughly 0.7× the camera height. */
  static zoomForHeight(height: number): number {
    let z = MIN_ZOOM;
    while (z < MAX_ZOOM && tileWorldSize(z + 1) > height * 0.7) z++;
    return z;
  }

  /** Ensure coverage around the ground point (cx, cz) the camera orbits. */
  cover(cx: number, cz: number, height: number) {
    if (!this.template) return;
    this.focus = { x: cx, z: cz };
    const now = performance.now();

    const zoom = VectorWorld.zoomForHeight(height);
    const rects: Rect[] = [];
    this.coverGround(cx, cz, zoom, DETAIL_RADIUS, now, rects);
    if (zoom - 3 >= MIN_ZOOM) this.coverGround(cx, cz, zoom - 3, HORIZON_RADIUS, now, rects);
    for (const t of this.groundTiles.values()) {
      if (t.lastUsed === now) continue;
      const half = t.size / 2;
      if (rects.some(r => t.cx + half >= r.minX && t.cx - half <= r.maxX && t.cz + half >= r.minZ && t.cz - half <= r.maxZ)) t.lastUsed = now;
    }

    if (height < BUILDING_MAX_HEIGHT) {
      const radius = height < 200 ? 2 : 3;
      this.coverBuildings(cx, cz, radius, now);
    }

    this.prune(now);
    this.evict(now);
    this.pump();
  }

  /**
   * Forget queued tiles the camera no longer wants (e.g. ones it flew past),
   * so bandwidth goes to what's on screen now.
   */
  private prune(now: number) {
    const drop = (map: Map<string, { lastUsed: number; state: string }>) => {
      for (const [key, t] of map) if (t.state === "queued" && t.lastUsed !== now) map.delete(key);
    };
    drop(this.groundTiles);
    drop(this.buildingTiles);
  }

  private ring(cx: number, cz: number, zoom: number, radius: number) {
    const n = Math.pow(2, zoom);
    const { tx, ty } = worldToTile(cx, cz, zoom);
    const ctx = Math.floor(tx), cty = Math.floor(ty);
    const out: { x: number; y: number }[] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const y = cty + dy;
        if (y < 0 || y >= n) continue;
        out.push({ x: (((ctx + dx) % n) + n) % n, y });
      }
    }
    const center = tileToWorld(ctx, cty, zoom);
    const half = (radius + 0.5) * center.size;
    return { tiles: out, rect: { minX: center.x - half, maxX: center.x + half, minZ: center.z - half, maxZ: center.z + half } };
  }

  private coverGround(cx: number, cz: number, zoom: number, radius: number, now: number, rects: Rect[]) {
    const { tiles, rect } = this.ring(cx, cz, zoom, radius);
    rects.push(rect);
    for (const { x, y } of tiles) {
      const key = `${zoom}/${x}/${y}`;
      const t = this.groundTiles.get(key);
      if (t) { t.lastUsed = now; continue; }
      const w = tileToWorld(x, y, zoom);
      this.groundTiles.set(key, { mesh: null, z: zoom, x, y, cx: w.x, cz: w.z, size: w.size, lastUsed: now, state: "queued" });
      this.queue.push({ id: 0, kind: "ground", key, z: zoom, x, y, cx: w.x, cz: w.z, size: w.size });
    }
  }

  private coverBuildings(cx: number, cz: number, radius: number, now: number) {
    const { tiles } = this.ring(cx, cz, BUILDING_ZOOM, radius);
    for (const { x, y } of tiles) {
      const key = `${x}/${y}`;
      const t = this.buildingTiles.get(key);
      if (t) { t.lastUsed = now; continue; }
      const w = tileToWorld(x, y, BUILDING_ZOOM);
      this.buildingTiles.set(key, { mesh: null, x, y, cx: w.x, cz: w.z, size: w.size, lastUsed: now, grow: 0, state: "queued" });
      this.queue.push({ id: 0, kind: "buildings", key, z: BUILDING_ZOOM, x, y, cx: w.x, cz: w.z, size: w.size });
    }
  }

  /** Dispatch queued jobs nearest-first, dropping ones that went stale. */
  private pump() {
    if (!this.template || this.inFlight.size >= MAX_IN_FLIGHT || this.queue.length === 0) return;
    const { x: fx, z: fz } = this.focus;
    // nearest first; a coarse tile covers so much screen it counts as closer
    const rank = (j: Job) => Math.hypot(j.cx - fx, j.cz - fz) / (j.kind === "ground" ? j.size / 60 : 1);
    this.queue.sort((a, b) => rank(a) - rank(b));
    while (this.inFlight.size < MAX_IN_FLIGHT && this.queue.length) {
      const job = this.queue.shift()!;
      const tile = job.kind === "ground" ? this.groundTiles.get(job.key) : this.buildingTiles.get(job.key);
      if (!tile || tile.state !== "queued") continue;
      tile.state = "loading";
      job.id = this.nextId++;
      this.inFlight.set(job.id, job);
      const req: TileRequest = {
        id: job.id,
        url: this.template.replace("{z}", String(job.z)).replace("{x}", String(job.x)).replace("{y}", String(job.y)),
        z: job.z, x: job.x, y: job.y,
        size: job.size,
        ground: job.kind === "ground",
        buildings: job.kind === "buildings",
      };
      this.workers[this.nextWorker++ % this.workers.length].postMessage(req);
    }
  }

  private onResult(res: TileResult) {
    const job = this.inFlight.get(res.id);
    this.inFlight.delete(res.id);
    if (this.disposed || !job) return;

    if (job.kind === "ground") {
      const tile = this.groundTiles.get(job.key);
      if (tile && tile.state === "loading") {
        tile.state = res.failed ? "failed" : "ready";
        if (res.ground) {
          const mat = new THREE.MeshBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0,
            depthTest: false, depthWrite: false, side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(toGeometry(res.ground), mat);
          mesh.position.set(job.cx, 0, job.cz);
          mesh.renderOrder = job.z - 20; // coarser zooms paint first
          mesh.matrixAutoUpdate = false;
          mesh.updateMatrix();
          tile.mesh = mesh;
          this.ground.add(mesh);
        }
      }
    } else {
      const tile = this.buildingTiles.get(job.key);
      if (tile && tile.state === "loading") {
        tile.state = res.failed ? "failed" : "ready";
        if (res.buildings) {
          const mesh = new THREE.Mesh(toGeometry(res.buildings), this.buildingMaterial);
          mesh.position.set(job.cx, 0, job.cz);
          mesh.scale.y = 0.001;
          tile.mesh = mesh;
          this.buildings.add(mesh);
        }
      }
    }
    this.pump();
  }

  private evict(now: number) {
    const trim = <T extends { lastUsed: number; mesh: THREE.Mesh | null; state: string }>(
      map: Map<string, T>, max: number, group: THREE.Group, disposeMaterial: boolean
    ) => {
      if (map.size <= max) return;
      const entries = [...map.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      for (let i = 0; i < map.size - max; i++) {
        const [key, t] = entries[i];
        if (now - t.lastUsed < 2000) break; // the rest are on screen
        if (t.mesh) {
          group.remove(t.mesh);
          t.mesh.geometry.dispose();
          if (disposeMaterial) (t.mesh.material as THREE.Material).dispose();
        }
        map.delete(key);
      }
    };
    trim(this.groundTiles, MAX_GROUND, this.ground, true);
    trim(this.buildingTiles, MAX_BUILDINGS, this.buildings, false);
    // drop queued jobs whose tile was evicted
    this.queue = this.queue.filter(j => (j.kind === "ground" ? this.groundTiles : this.buildingTiles).has(j.key));
  }

  /** Per-frame fades and building growth. */
  update(dt: number) {
    for (const t of this.groundTiles.values()) {
      const m = t.mesh?.material;
      if (m && m.opacity < 1) m.opacity = Math.min(1, m.opacity + dt * GROUND_FADE);
    }
    for (const t of this.buildingTiles.values()) {
      if (!t.mesh || t.grow >= 1) continue;
      t.grow = Math.min(1, t.grow + dt / GROW_TIME);
      t.mesh.scale.y = Math.max(0.001, easeOutBack(t.grow));
    }
  }

  dispose() {
    this.disposed = true;
    for (const w of this.workers) w.terminate();
    for (const t of this.groundTiles.values()) {
      t.mesh?.geometry.dispose();
      t.mesh?.material.dispose();
    }
    for (const t of this.buildingTiles.values()) t.mesh?.geometry.dispose();
    this.buildingMaterial.dispose();
    this.groundTiles.clear();
    this.buildingTiles.clear();
  }
}
