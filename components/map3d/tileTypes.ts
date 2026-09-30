/** Messages exchanged with tile.worker.ts. */

export interface TileRequest {
  id: number;
  url: string;
  z: number;
  x: number;
  y: number;
  /** Tile side length in world units. */
  size: number;
  ground: boolean;
  buildings: boolean;
}

export interface MeshArrays {
  position: Float32Array;
  /** RGB, 0–255, normalized in the shader. */
  color: Uint8Array;
  normal: Float32Array | null;
  index: Uint32Array;
}

export interface TileResult {
  id: number;
  ground: MeshArrays | null;
  buildings: MeshArrays | null;
  failed?: boolean;
}
