import * as THREE from "three";
import { tileToWorld, tileWorldSize, worldToTile } from "@/lib/geo";

const MIN_ZOOM = 9;
const MAX_ZOOM = 16;
const MAX_TILES = 700;
const DETAIL_RADIUS = 3;  // 7×7 ring at the active zoom
const HORIZON_RADIUS = 2; // 5×5 ring three zooms coarser, for tilted views
const FADE_SPEED = 3;     // opacity units per second

/**
 * Esri's dark canvas basemap: free to use with attribution, no API key.
 * Rendered as two stacked rasters per tile — the base fill and a separate
 * transparent labels layer — so roads sit under the transit lines while
 * place names stay legible above them.
 */
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
const SOURCES = [
  { name: "base",   url: (z: number, x: number, y: number) => `${ESRI}/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`,      order: 0 },
  { name: "labels", url: (z: number, x: number, y: number) => `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/${z}/${y}/${x}`, order: 1 },
] as const;

export const TILE_ATTRIBUTION = "Esri, HERE, Garmin, © OpenStreetMap contributors";

interface Tile {
  meshes: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[];
  x: number;
  z: number;
  size: number;
  lastUsed: number;
}

interface WorldRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Dark raster basemap streamed onto the ground plane. Coverage is anchored on
 * the point the camera orbits (not the frustum bbox, which explodes when the
 * view tilts): a detail ring at the height-derived zoom plus a coarser horizon
 * ring underneath. Tiles intersecting the covered area are kept alive across
 * zoom changes so nothing visible is ever evicted mid-frame.
 *
 * Every tile material has depth testing disabled and draws in a fixed
 * renderOrder band below the transit layers, so tiles at different zooms can
 * never z-fight with each other or with the ground plane.
 */
export class TileLayer {
  readonly group = new THREE.Group();
  private tiles = new Map<string, Tile>();
  private loader = new THREE.TextureLoader();
  private geometry = new THREE.PlaneGeometry(1, 1);
  private disposed = false;

  constructor() {
    this.loader.setCrossOrigin("anonymous");
  }

  /** Pick a tile zoom so one tile spans roughly half the camera height. */
  static zoomForHeight(height: number): number {
    let z = MIN_ZOOM;
    while (z < MAX_ZOOM && tileWorldSize(z + 1) > height * 0.45) z++;
    return z;
  }

  /** Ensure coverage around the ground point (cx, cz) the camera is looking at. */
  cover(cx: number, cz: number, height: number) {
    const zoom = TileLayer.zoomForHeight(height);
    const now = performance.now();
    const rects: WorldRect[] = [];
    this.coverRing(cx, cz, zoom, DETAIL_RADIUS, now, rects);
    if (zoom - 3 >= MIN_ZOOM) {
      this.coverRing(cx, cz, zoom - 3, HORIZON_RADIUS, now, rects);
    }
    this.touchVisible(rects, now);
    this.evict(now);
  }

  /** Load a (2r+1)² ring of tiles centered on the world point, nearest first. */
  private coverRing(cx: number, cz: number, zoom: number, radius: number, now: number, rects: WorldRect[]) {
    const n = Math.pow(2, zoom);
    const { tx, ty } = worldToTile(cx, cz, zoom);
    const ctx = Math.floor(tx), cty = Math.floor(ty);

    const center = tileToWorld(ctx, cty, zoom);
    const half = (radius + 0.5) * center.size;
    rects.push({ minX: center.x - half, maxX: center.x + half, minZ: center.z - half, maxZ: center.z + half });

    const coords: [number, number][] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) coords.push([ctx + dx, cty + dy]);
    }
    coords.sort((a, b) =>
      (Math.abs(a[0] - ctx) + Math.abs(a[1] - cty)) - (Math.abs(b[0] - ctx) + Math.abs(b[1] - cty))
    );

    for (const [x, y] of coords) {
      if (y < 0 || y >= n) continue;
      const wx = ((x % n) + n) % n; // wrap longitude
      const key = `${zoom}/${wx}/${y}`;
      const existing = this.tiles.get(key);
      if (existing) { existing.lastUsed = now; continue; }
      this.spawn(key, zoom, wx, y, now);
    }
  }

  /** Keep every cached tile that overlaps the covered area alive, at any zoom. */
  private touchVisible(rects: WorldRect[], now: number) {
    for (const tile of this.tiles.values()) {
      const half = tile.size / 2;
      for (const r of rects) {
        if (tile.x + half >= r.minX && tile.x - half <= r.maxX && tile.z + half >= r.minZ && tile.z - half <= r.maxZ) {
          tile.lastUsed = now;
          break;
        }
      }
    }
  }

  private spawn(key: string, zoom: number, tx: number, ty: number, now: number) {
    const { x, z, size } = tileToWorld(tx, ty, zoom);
    const tile: Tile = { meshes: [], x, z, size, lastUsed: now };
    this.tiles.set(key, tile);

    for (const source of SOURCES) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        fog: true,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(size, size, 1);
      mesh.position.set(x, 0, z);
      // Band [-20, 14): coarser zooms draw first, labels above their own base.
      mesh.renderOrder = (zoom - MIN_ZOOM - 10) * 2 + source.order;
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
      tile.meshes.push(mesh);

      this.loader.load(
        source.url(zoom, tx, ty),
        texture => {
          if (this.disposed || !this.tiles.has(key)) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4;
          texture.generateMipmaps = false;
          texture.minFilter = THREE.LinearFilter;
          material.map = texture;
          material.needsUpdate = true;
          mesh.visible = true;
        },
        undefined,
        () => { /* missing tile: leave invisible, ground plane shows through */ }
      );
    }
  }

  private evict(now: number) {
    if (this.tiles.size <= MAX_TILES) return;
    const entries = [...this.tiles.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const excess = this.tiles.size - MAX_TILES;
    for (let i = 0; i < excess; i++) {
      const [key, tile] = entries[i];
      if (now - tile.lastUsed < 2000) break; // everything left is fresh / on screen
      this.remove(key, tile);
    }
  }

  private remove(key: string, tile: Tile) {
    for (const mesh of tile.meshes) {
      this.group.remove(mesh);
      mesh.material.map?.dispose();
      mesh.material.dispose();
    }
    this.tiles.delete(key);
  }

  /** Per-frame fade-in of freshly loaded tiles. */
  update(dt: number) {
    for (const tile of this.tiles.values()) {
      for (const mesh of tile.meshes) {
        if (!mesh.visible) continue;
        const m = mesh.material;
        if (m.opacity < 1) m.opacity = Math.min(1, m.opacity + dt * FADE_SPEED);
      }
    }
  }

  dispose() {
    this.disposed = true;
    for (const [key, tile] of this.tiles) this.remove(key, tile);
    this.geometry.dispose();
  }
}
