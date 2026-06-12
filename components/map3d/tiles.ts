import * as THREE from "three";
import { tileToWorld, tileWorldSize, worldToTile } from "@/lib/geo";

const SUBDOMAINS = ["a", "b", "c", "d"];
const MIN_ZOOM = 9;
const MAX_ZOOM = 17;
const MAX_TILES = 320;
const MAX_GRID = 9; // never load more than 9×9 tiles per refresh
const FADE_SPEED = 2.4; // opacity units per second

function tileUrl(z: number, x: number, y: number) {
  const s = SUBDOMAINS[(x + y) % SUBDOMAINS.length];
  return `https://${s}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}@2x.png`;
}

interface Tile {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  loaded: boolean;
  lastUsed: number;
}

/**
 * Dark raster basemap streamed onto the ground plane. Zoom level follows
 * camera height; stale tiles from other zooms stay underneath (renderOrder
 * stacks by zoom) until evicted, so zooming never flashes empty ground.
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

  /** Ensure tiles cover the ground rectangle [minX..maxX, minZ..maxZ]. */
  cover(minX: number, maxX: number, minZ: number, maxZ: number, height: number) {
    const zoom = TileLayer.zoomForHeight(height);
    const n = Math.pow(2, zoom);
    const a = worldToTile(minX, minZ, zoom);
    const b = worldToTile(maxX, maxZ, zoom);
    let tx0 = Math.floor(Math.min(a.tx, b.tx)) - 1;
    let tx1 = Math.floor(Math.max(a.tx, b.tx)) + 1;
    let ty0 = Math.floor(Math.min(a.ty, b.ty)) - 1;
    let ty1 = Math.floor(Math.max(a.ty, b.ty)) + 1;

    // Clamp the grid around its center so a grazing camera angle can't request hundreds of tiles
    const cx = (tx0 + tx1) / 2, cy = (ty0 + ty1) / 2;
    if (tx1 - tx0 + 1 > MAX_GRID) { tx0 = Math.round(cx - MAX_GRID / 2); tx1 = tx0 + MAX_GRID - 1; }
    if (ty1 - ty0 + 1 > MAX_GRID) { ty0 = Math.round(cy - MAX_GRID / 2); ty1 = ty0 + MAX_GRID - 1; }

    const now = performance.now();
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = Math.max(0, ty0); ty <= Math.min(n - 1, ty1); ty++) {
        const wx = ((tx % n) + n) % n; // wrap longitude
        const key = `${zoom}/${wx}/${ty}`;
        const existing = this.tiles.get(key);
        if (existing) { existing.lastUsed = now; continue; }
        this.spawn(key, zoom, wx, ty, now);
      }
    }
    this.evict(now);
  }

  private spawn(key: string, zoom: number, tx: number, ty: number, now: number) {
    const { x, z, size } = tileToWorld(tx, ty, zoom);
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(size, size, 1);
    mesh.position.set(x, 0, z);
    mesh.renderOrder = zoom; // higher zoom draws on top
    mesh.visible = false;
    this.group.add(mesh);

    const tile: Tile = { mesh, loaded: false, lastUsed: now };
    this.tiles.set(key, tile);

    this.loader.load(
      tileUrl(zoom, tx, ty),
      texture => {
        if (this.disposed) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        material.map = texture;
        material.needsUpdate = true;
        mesh.visible = true;
        tile.loaded = true;
      },
      undefined,
      () => { /* missing tile: leave invisible, ground plane shows through */ }
    );
  }

  private evict(now: number) {
    if (this.tiles.size <= MAX_TILES) return;
    const entries = [...this.tiles.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const excess = this.tiles.size - MAX_TILES;
    for (let i = 0; i < excess; i++) {
      const [key, tile] = entries[i];
      if (now - tile.lastUsed < 2000) break; // everything is fresh
      this.remove(key, tile);
    }
  }

  private remove(key: string, tile: Tile) {
    this.group.remove(tile.mesh);
    tile.mesh.material.map?.dispose();
    tile.mesh.material.dispose();
    this.tiles.delete(key);
  }

  /** Per-frame fade-in of freshly loaded tiles. */
  update(dt: number) {
    for (const tile of this.tiles.values()) {
      if (!tile.loaded) continue;
      const m = tile.mesh.material;
      if (m.opacity < 1) m.opacity = Math.min(1, m.opacity + dt * FADE_SPEED);
    }
  }

  dispose() {
    this.disposed = true;
    for (const [key, tile] of this.tiles) this.remove(key, tile);
    this.geometry.dispose();
  }
}
