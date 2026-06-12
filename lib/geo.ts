// Web Mercator (EPSG:3857) projection into the three.js world plane.
// World axes: +x = east, +z = south, +y = up. 1 world unit = 20 meters.

const EARTH_RADIUS = 6378137;
export const MERCATOR_WORLD_METERS = 2 * Math.PI * EARTH_RADIUS; // ≈ 40,075,016 m

/** World units per mercator meter (1 unit = 20 m). */
export const WORLD_SCALE = 0.05;

/** Boston Common — origin of the world plane. */
export const ORIGIN = { lat: 42.3601, lon: -71.0589 };

function mercX(lon: number) {
  return EARTH_RADIUS * (lon * Math.PI) / 180;
}
function mercY(lat: number) {
  const phi = (lat * Math.PI) / 180;
  return EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2));
}

const ORIGIN_X = mercX(ORIGIN.lon);
const ORIGIN_Y = mercY(ORIGIN.lat);

/** lat/lon → { x, z } world-plane coordinates. */
export function project(lat: number, lon: number): { x: number; z: number } {
  return {
    x: (mercX(lon) - ORIGIN_X) * WORLD_SCALE,
    z: -(mercY(lat) - ORIGIN_Y) * WORLD_SCALE, // mercator y grows north, world z grows south
  };
}

// ── Slippy-map tile math ────────────────────────────────────────────────

/** Side length of one tile at zoom z, in world units. */
export function tileWorldSize(z: number): number {
  return (MERCATOR_WORLD_METERS * WORLD_SCALE) / Math.pow(2, z);
}

/** World x/z → fractional tile coordinates at zoom z. */
export function worldToTile(x: number, z: number, zoom: number): { tx: number; ty: number } {
  const mx = x / WORLD_SCALE + ORIGIN_X;
  const my = -z / WORLD_SCALE + ORIGIN_Y;
  const n = Math.pow(2, zoom);
  return {
    tx: ((mx / MERCATOR_WORLD_METERS) + 0.5) * n,
    ty: (0.5 - (my / MERCATOR_WORLD_METERS)) * n,
  };
}

/** Tile x/y/z → world-plane center and size of that tile. */
export function tileToWorld(tx: number, ty: number, zoom: number): { x: number; z: number; size: number } {
  const n = Math.pow(2, zoom);
  const size = tileWorldSize(zoom);
  const mx = ((tx + 0.5) / n - 0.5) * MERCATOR_WORLD_METERS;
  const my = (0.5 - (ty + 0.5) / n) * MERCATOR_WORLD_METERS;
  return {
    x: (mx - ORIGIN_X) * WORLD_SCALE,
    z: -(my - ORIGIN_Y) * WORLD_SCALE,
    size,
  };
}
