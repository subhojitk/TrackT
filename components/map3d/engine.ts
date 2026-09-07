import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import type { Vehicle } from "@/types/mbta";
import { project, WORLD_SCALE } from "@/lib/geo";
import { TileLayer } from "./tiles";

// Heights above the tile plane, in world units (1 unit = 20 m)
const ROUTE_Y = 0.5;
const STOP_Y = 0.7;
const TRAIN_Y = 1.1;

const MAX_TRAIN_SPEED = 3.5; // world units/s ≈ 156 mph — sanity cap for inference
const CRAWL_SPEED = 0.45;    // ≈ 20 mph — minimum display speed for in-transit trains
const STALE_CAP = 20;        // seconds of dead-reckoning before the carrot stops advancing

// On-screen size floors so markers stay legible at every zoom
const TRAIN_MIN_PX = 16;     // train length
const STOP_MIN_PX = 5;       // stop ring radius
const TRAIN_LENGTH = 2.1;
const STOP_RING_RADIUS = 1.45;

// Camera limits
const MIN_DISTANCE = 25;
const MAX_DISTANCE = 7000;

/**
 * Draw order bands. Depth testing is disabled on every flat layer, so this
 * ordering alone decides what covers what — no z-fighting at any distance.
 *   tiles: -20 … 13 (see TileLayer)
 */
const ORDER = {
  ground: -30,
  routeHalo: 30,
  routeCore: 31,
  stopRing: 35,
  stopCore: 36,
  currentStop: 37,
  trainGlow: 39,
  train: 40,
} as const;

export interface HoverInfo {
  kind: "train" | "stop";
  title: string;
  subtitle: string;
}

export interface StopDatum {
  id: string;
  lat: number;
  lon: number;
  name?: string;
}

interface EngineOptions {
  onStopClick?: (stopId: string) => void;
  onHover?: (info: HoverInfo | null, x: number, y: number) => void;
  /** Fired when the WebGL context is lost and cannot be restored. */
  onError?: (message: string) => void;
}

// ── Polyline helpers ────────────────────────────────────────────────────

function projectShape(latLons: [number, number][]): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  let prev: THREE.Vector3 | null = null;
  for (const [lat, lon] of latLons) {
    const { x, z } = project(lat, lon);
    const p = new THREE.Vector3(x, TRAIN_Y, z);
    if (prev && prev.distanceToSquared(p) < 1e-6) continue;
    pts.push(p);
    prev = p;
  }
  return pts;
}

/**
 * Iterative Douglas–Peucker on the xz plane. Raw MBTA shapes carry thousands
 * of sub-pixel segments whose overlapping translucent quads shimmer while the
 * camera moves — simplify before building display geometry.
 */
function simplifyXZ(points: THREE.Vector3[], tolerance: number): THREE.Vector3[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const tol2 = tolerance * tolerance;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = points[a].x, az = points[a].z;
    const dx = points[b].x - ax, dz = points[b].z - az;
    const len2 = dx * dx + dz * dz;
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const px = points[i].x - ax, pz = points[i].z - az;
      let d: number;
      if (len2 === 0) {
        d = px * px + pz * pz;
      } else {
        const t = THREE.MathUtils.clamp((px * dx + pz * dz) / len2, 0, 1);
        const ex = px - t * dx, ez = pz - t * dz;
        d = ex * ex + ez * ez;
      }
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol2 && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

// ── Arc-length parameterized polyline ───────────────────────────────────

class TrackLine {
  points: THREE.Vector3[] = [];
  private cum: number[] = [];
  total = 0;

  constructor(points: THREE.Vector3[]) {
    let prev: THREE.Vector3 | null = null;
    for (const p of points) {
      this.points.push(p);
      this.cum.push(prev ? this.total += prev.distanceTo(p) : 0);
      prev = p;
    }
  }

  private segmentAt(s: number): number {
    let lo = 0, hi = this.cum.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid] <= s) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  pointAt(s: number, out: THREE.Vector3): THREE.Vector3 {
    s = THREE.MathUtils.clamp(s, 0, this.total);
    const i = this.segmentAt(s);
    const a = this.points[i], b = this.points[i + 1];
    const len = this.cum[i + 1] - this.cum[i];
    const t = len > 0 ? (s - this.cum[i]) / len : 0;
    return out.lerpVectors(a, b, t);
  }

  tangentAt(s: number, out: THREE.Vector3): THREE.Vector3 {
    s = THREE.MathUtils.clamp(s, 0, this.total);
    const i = this.segmentAt(s);
    return out.subVectors(this.points[i + 1], this.points[i]).normalize();
  }

  /** Nearest arc-length position to a world point (projected onto xz). */
  nearest(p: THREE.Vector3): { s: number; dist: number } {
    let bestS = 0, bestD = Infinity;
    const ab = new THREE.Vector3(), ap = new THREE.Vector3();
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i], b = this.points[i + 1];
      ab.subVectors(b, a);
      ap.subVectors(p, a);
      const len2 = ab.x * ab.x + ab.z * ab.z;
      const t = len2 > 0 ? THREE.MathUtils.clamp((ap.x * ab.x + ap.z * ab.z) / len2, 0, 1) : 0;
      const dx = ap.x - ab.x * t, dz = ap.z - ab.z * t;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        bestS = this.cum[i] + t * (this.cum[i + 1] - this.cum[i]);
      }
    }
    return { s: bestS, dist: Math.sqrt(bestD) };
  }
}

interface TrainState {
  group: THREE.Group;
  body: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  tip: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  glow: THREE.Sprite;
  track: TrackLine | null;
  s: number;          // animated arc position
  sTarget: number;    // last API arc position
  vel: number;        // inferred world units/s along the track (signed)
  dispSpeed: number;  // animated display speed (signed, world units/s)
  dirSign: 1 | -1;    // direction of travel along the track
  tUpdate: number;    // engine clock at last API update
  apiUpdatedAt: number | null;
  raw: THREE.Vector3; // raw projected position (off-route fallback)
  yaw: number;
  appear: number;     // 0→1 spawn fade
  data: Vehicle;
}

function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.28)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Engine ──────────────────────────────────────────────────────────────

export class MapEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: MapControls;
  private startMs = performance.now();
  private lastMs = performance.now();
  private raf = 0;
  private disposed = false;

  private tiles = new TileLayer();
  private routesGroup = new THREE.Group();
  private stopsGroup = new THREE.Group();
  private trainsGroup = new THREE.Group();
  private lineMaterials: LineMaterial[] = [];

  private tracks = new Map<string, TrackLine>();
  private trains = new Map<string, TrainState>();
  private stopIds: string[] = [];
  private stopNames = new Map<string, string>();
  private stopMesh: THREE.InstancedMesh | null = null;
  private stopRingMesh: THREE.InstancedMesh | null = null;
  private stopBase: THREE.Vector3[] = [];
  private lastStopCam = new THREE.Vector3(Infinity, Infinity, Infinity);
  private currentStopGroup: THREE.Group | null = null;
  private pulseRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null;

  // shared resources (never disposed by clearGroup)
  private glowTexture = makeGlowTexture();
  private trainBodyGeo = new THREE.BoxGeometry(0.62, 0.5, TRAIN_LENGTH);
  private trainTipGeo = new THREE.BoxGeometry(0.5, 0.52, 0.42);
  private stopGeo = new THREE.CylinderGeometry(1, 1, 0.45, 20);
  private stopRingGeo = new THREE.RingGeometry(1.0, STOP_RING_RADIUS, 28);
  private sharedGeometries: Set<THREE.BufferGeometry>;

  // fly-to tween
  private fly: {
    t0: number; dur: number;
    fromPos: THREE.Vector3; toPos: THREE.Vector3;
    fromTarget: THREE.Vector3; toTarget: THREE.Vector3;
    arc: boolean;
  } | null = null;

  /** Where "reset view" returns to: the last fitted route bbox or fly-to stop. */
  private home: { target: THREE.Vector3; pos: THREE.Vector3 } | null = null;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDownAt: { x: number; y: number } | null = null;
  private lastTileRefresh = 0;
  private opts: EngineOptions;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver;

  // scratch
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();

  constructor(container: HTMLElement, opts: EngineOptions = {}) {
    this.container = container;
    this.opts = opts;
    this.sharedGeometries = new Set([this.trainBodyGeo, this.trainTipGeo, this.stopGeo, this.stopRingGeo]);

    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.setAttribute("aria-label", "Interactive network map");
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0b0c10);
    this.scene.fog = new THREE.FogExp2(0x0b0c10, 0.00009);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 1, 60000);
    this.camera.position.set(0, 380, 230);

    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.zoomToCursor = true;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = MIN_DISTANCE;
    this.controls.maxDistance = MAX_DISTANCE;
    this.controls.maxPolarAngle = 1.12; // ≈ 64° — keeps the horizon (and empty ground) off screen
    this.controls.target.set(0, 0, 0);

    // Base ground plane under the tiles. Never writes depth: the flat layers
    // above are ordered purely by renderOrder.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200000, 200000),
      new THREE.MeshBasicMaterial({ color: 0x0d0e12, depthWrite: false, depthTest: false })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.renderOrder = ORDER.ground;
    this.scene.add(ground);

    this.scene.add(new THREE.HemisphereLight(0x95a3c4, 0x0a0a12, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(300, 600, -200);
    this.scene.add(sun);

    this.scene.add(this.tiles.group, this.routesGroup, this.stopsGroup, this.trainsGroup);

    const dom = this.renderer.domElement;
    dom.addEventListener("pointermove", this.onPointerMove);
    // capture phase so the fly tween is cancelled before MapControls sees the gesture
    dom.addEventListener("pointerdown", this.onPointerDown, true);
    dom.addEventListener("wheel", this.onWheelCapture, { capture: true, passive: true });
    dom.addEventListener("pointerup", this.onPointerUp);
    dom.addEventListener("pointerleave", this.onPointerLeave);
    dom.addEventListener("webglcontextlost", this.onContextLost);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);

    this.loop();
  }

  // ── Data in ───────────────────────────────────────────────────────────

  /** Rebuild route lines + animation tracks. colors maps shape key → hex. */
  setShapes(shapes: Record<string, [number, number][]>, colors: Record<string, string>, fit: boolean) {
    this.clearGroup(this.routesGroup);
    for (const m of this.lineMaterials) m.dispose();
    this.lineMaterials = [];
    this.tracks.clear();

    const bbox = new THREE.Box3();
    for (const [key, latLons] of Object.entries(shapes)) {
      if (latLons.length < 2) continue;
      const raw = projectShape(latLons);
      const track = new TrackLine(simplifyXZ(raw, 0.25));
      if (track.points.length < 2) continue;
      this.tracks.set(key, track);

      const positions: number[] = [];
      for (const p of simplifyXZ(raw, 1.0)) {
        positions.push(p.x, ROUTE_Y, p.z);
        bbox.expandByPoint(p);
      }
      const geo = new LineGeometry();
      geo.setPositions(positions);
      const color = colors[key] ?? "#ffffff";

      const core = new LineMaterial({
        color: new THREE.Color(color).getHex(),
        linewidth: 3.5,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
      });
      const halo = new LineMaterial({
        color: new THREE.Color(color).getHex(),
        linewidth: 9,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      });
      this.lineMaterials.push(core, halo);

      const coreLine = new Line2(geo, core);
      const haloLine = new Line2(geo, halo);
      coreLine.renderOrder = ORDER.routeCore;
      haloLine.renderOrder = ORDER.routeHalo;
      coreLine.computeLineDistances();
      haloLine.computeLineDistances();
      this.routesGroup.add(haloLine, coreLine);
    }
    this.updateLineResolution();

    // Re-snap live trains onto the fresh tracks
    for (const st of this.trains.values()) {
      const track = this.tracks.get(st.data.route) ?? null;
      st.track = track;
      if (track) {
        const { s } = track.nearest(st.raw);
        st.s = s;
        st.sTarget = s;
        st.vel = 0;
      }
    }

    if (fit && !bbox.isEmpty()) this.flyToBox(bbox);
  }

  setStops(stops: StopDatum[], color: string, currentStopId?: string) {
    this.clearGroup(this.stopsGroup);
    this.stopMesh = null;
    this.stopRingMesh = null;
    this.stopBase = [];
    this.currentStopGroup = null;
    this.pulseRing = null;
    this.stopIds = [];
    this.stopNames.clear();
    this.lastStopCam.set(Infinity, Infinity, Infinity);

    if (stops.length > 0) {
      // Transit-map style: white core + line-colored ring, screen-size-scaled per frame
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false });
      const core = new THREE.InstancedMesh(this.stopGeo, coreMat, stops.length);
      core.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      const ring = new THREE.InstancedMesh(this.stopRingGeo, ringMat, stops.length);
      ring.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (const stop of stops) {
        const { x, z } = project(stop.lat, stop.lon);
        this.stopBase.push(new THREE.Vector3(x, STOP_Y, z));
        this.stopIds.push(stop.id);
        if (stop.name) this.stopNames.set(stop.id, stop.name);
      }
      core.renderOrder = ORDER.stopCore;
      ring.renderOrder = ORDER.stopRing;
      this.stopsGroup.add(ring, core);
      this.stopMesh = core;
      this.stopRingMesh = ring;
      this.updateStopScales(true);
    }

    if (currentStopId) {
      const cur = stops.find(s => s.id === currentStopId);
      if (cur) {
        const { x, z } = project(cur.lat, cur.lon);
        const group = new THREE.Group();
        group.position.set(x, STOP_Y, z);

        const puck = new THREE.Mesh(
          this.stopGeo,
          new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false })
        );
        puck.scale.set(2.1, 1.4, 2.1);
        puck.renderOrder = ORDER.currentStop;

        const halo = new THREE.Mesh(
          this.stopRingGeo,
          new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, depthTest: false, depthWrite: false })
        );
        halo.rotation.x = -Math.PI / 2;
        halo.scale.setScalar(2.3);
        halo.position.y = 0.05;
        halo.renderOrder = ORDER.currentStop;

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1, 1.18, 48),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.3;
        ring.renderOrder = ORDER.currentStop;

        group.add(halo, puck, ring);
        this.stopsGroup.add(group);
        this.currentStopGroup = group;
        this.pulseRing = ring as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      }
    }
  }

  /** World units covered by one screen pixel at the given camera distance. */
  private unitsPerPixel(dist: number): number {
    const h = this.container.clientHeight || 1;
    return (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / h;
  }

  /** Scale stop markers so they keep a legible on-screen size at any zoom. */
  private updateStopScales(force = false) {
    const core = this.stopMesh, ring = this.stopRingMesh;
    if (!core || !ring || this.stopBase.length === 0) return;
    const cam = this.camera.position;
    if (!force && this.lastStopCam.distanceToSquared(cam) < 0.25) return;
    this.lastStopCam.copy(cam);
    const m = new THREE.Matrix4();
    const upright = new THREE.Quaternion();
    const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const sc = new THREE.Vector3();
    for (let i = 0; i < this.stopBase.length; i++) {
      const p = this.stopBase[i];
      const upp = this.unitsPerPixel(p.distanceTo(cam));
      const k = THREE.MathUtils.clamp((STOP_MIN_PX * upp) / STOP_RING_RADIUS, 1.2, 40);
      m.compose(p, upright, sc.set(0.8 * k, 1, 0.8 * k));
      core.setMatrixAt(i, m);
      m.compose(p, flat, sc.set(k, k, 1));
      ring.setMatrixAt(i, m);
    }
    core.instanceMatrix.needsUpdate = true;
    ring.instanceMatrix.needsUpdate = true;
  }

  /**
   * Feed a fresh vehicle poll. Each train's velocity along its track is
   * inferred from the arc-length it covered since the previous update,
   * using the API's own updated_at timestamps when available.
   */
  setVehicles(vehicles: Vehicle[], colorFor: (route: string) => string) {
    const now = this.nowSec();
    const seen = new Set<string>();

    for (const v of vehicles) {
      seen.add(v.id);
      const { x, z } = project(v.lat, v.lon);
      let st = this.trains.get(v.id);

      if (!st) {
        st = this.spawnTrain(v, colorFor(v.route));
        st.raw.set(x, TRAIN_Y, z);
        st.group.position.copy(st.raw);
        const track = this.tracks.get(v.route) ?? null;
        st.track = track;
        if (track) {
          const hit = track.nearest(st.raw);
          st.s = st.sTarget = hit.s;
        }
        st.tUpdate = now;
        st.apiUpdatedAt = v.updatedAt ? Date.parse(v.updatedAt) : null;
        this.trains.set(v.id, st);
        continue;
      }

      st.raw.set(x, TRAIN_Y, z);
      const track = this.tracks.get(v.route) ?? st.track;
      st.track = track;

      if (track) {
        const hit = track.nearest(st.raw);
        // Time base: prefer the API's own timestamps, fall back to poll spacing
        const apiTs = v.updatedAt ? Date.parse(v.updatedAt) : null;
        let dt = now - st.tUpdate;
        if (apiTs && st.apiUpdatedAt && apiTs > st.apiUpdatedAt) {
          dt = (apiTs - st.apiUpdatedAt) / 1000;
        }
        if (dt > 0.5) {
          const inferred = (hit.s - st.sTarget) / dt;
          st.vel = THREE.MathUtils.clamp(inferred, -MAX_TRAIN_SPEED, MAX_TRAIN_SPEED);
          if (Math.abs(st.vel) > 0.05) st.dirSign = st.vel > 0 ? 1 : -1;
        }
        if (v.status === "STOPPED_AT") st.vel = 0;
        st.sTarget = hit.s;
        st.apiUpdatedAt = apiTs ?? st.apiUpdatedAt;
      }
      st.tUpdate = now;
      st.data = v;
      const color = colorFor(v.route);
      st.body.material.color.set(color);
      st.body.material.emissive.set(color);
      (st.glow.material as THREE.SpriteMaterial).color.set(color);
    }

    for (const [id, st] of this.trains) {
      if (!seen.has(id)) {
        this.disposeTrain(st);
        this.trains.delete(id);
      }
    }
  }

  private spawnTrain(v: Vehicle, color: string): TrainState {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0.15,
    });
    const body = new THREE.Mesh(this.trainBodyGeo, bodyMat);
    body.renderOrder = ORDER.train;

    const tip = new THREE.Mesh(
      this.trainTipGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.4 })
    );
    tip.position.z = 1.05;
    tip.renderOrder = ORDER.train;

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTexture,
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    }));
    glow.scale.setScalar(4);
    glow.renderOrder = ORDER.trainGlow;

    group.add(glow, body, tip);
    group.position.y = TRAIN_Y;
    group.userData.vehicleId = v.id;
    this.trainsGroup.add(group);

    return {
      group, body, tip, glow,
      track: null,
      s: 0, sTarget: 0, vel: 0,
      dispSpeed: 0,
      dirSign: (v.directionId === 0 ? 1 : -1) as 1 | -1,
      tUpdate: this.nowSec(),
      apiUpdatedAt: null,
      raw: new THREE.Vector3(0, TRAIN_Y, 0),
      yaw: Math.PI - THREE.MathUtils.degToRad(v.bearing || 0),
      appear: 0,
      data: v,
    };
  }

  private disposeTrain(st: TrainState) {
    this.trainsGroup.remove(st.group);
    st.body.material.dispose();
    st.tip.material.dispose();
    (st.glow.material as THREE.SpriteMaterial).dispose();
  }

  // ── Camera ────────────────────────────────────────────────────────────

  flyTo(lat: number, lon: number, height: number, duration = 1.6) {
    const { x, z } = project(lat, lon);
    const target = new THREE.Vector3(x, 0, z);
    const pos = target.clone().add(new THREE.Vector3(0, height, height * 0.55));
    this.home = { target: target.clone(), pos: pos.clone() };
    this.startFly(target, pos, duration, true);
  }

  private flyToBox(bbox: THREE.Box3, duration = 1.8) {
    const center = bbox.getCenter(new THREE.Vector3());
    center.y = 0;
    const size = bbox.getSize(new THREE.Vector3());
    const aspect = this.camera.aspect || 1;
    // Fit the wider axis, accounting for a portrait viewport
    const extent = Math.max(size.x / Math.min(aspect, 1), size.z, 30);
    const height = THREE.MathUtils.clamp(extent * 0.95, 60, MAX_DISTANCE * 0.85);
    const pos = center.clone().add(new THREE.Vector3(0, height, height * 0.45));
    this.home = { target: center.clone(), pos: pos.clone() };
    this.startFly(center, pos, duration, true);
  }

  /** Dolly toward/away from the orbit target. factor < 1 zooms in. */
  zoomBy(factor: number, duration = 0.4) {
    const target = this.controls.target.clone();
    const offset = this.camera.position.clone().sub(target);
    const dist = THREE.MathUtils.clamp(offset.length() * factor, MIN_DISTANCE, MAX_DISTANCE);
    offset.setLength(dist);
    this.startFly(target, target.clone().add(offset), duration, false);
  }

  /** Return to the last fitted view (the route bbox or the selected stop). */
  resetView(duration = 1.2) {
    if (!this.home) return;
    this.startFly(this.home.target.clone(), this.home.pos.clone(), duration, true);
  }

  private startFly(target: THREE.Vector3, pos: THREE.Vector3, duration: number, arc: boolean) {
    this.fly = {
      t0: this.nowSec(),
      dur: duration,
      fromPos: this.camera.position.clone(),
      toPos: pos,
      fromTarget: this.controls.target.clone(),
      toTarget: target,
      arc,
    };
  }

  // ── Frame loop ────────────────────────────────────────────────────────

  private nowSec() {
    return (performance.now() - this.startMs) / 1000;
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const nowMs = performance.now();
    const dt = Math.min((nowMs - this.lastMs) / 1000, 0.1);
    this.lastMs = nowMs;
    const now = (nowMs - this.startMs) / 1000;

    // Fly tween (user input cancels it via pointerdown/wheel)
    if (this.fly) {
      const f = this.fly;
      const t = THREE.MathUtils.clamp((now - f.t0) / f.dur, 0, 1);
      const e = easeInOutCubic(t);
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, e);
      this.camera.position.lerpVectors(f.fromPos, f.toPos, e);
      if (f.arc) {
        // gentle altitude arc so long hops feel like flight
        const hop = f.fromPos.distanceTo(f.toPos) * 0.12 * Math.sin(Math.PI * e);
        this.camera.position.y += hop;
      }
      this.camera.lookAt(this.controls.target);
      if (t >= 1) this.fly = null;
    } else {
      // damped controls own the camera only when no tween is active —
      // running both each frame makes them fight and the view jitters
      this.controls.update();
    }

    // Trains
    for (const st of this.trains.values()) {
      const stopped = st.data.status === "STOPPED_AT";
      st.appear = Math.min(1, st.appear + dt * 2);
      const distToCam = st.group.position.distanceTo(this.camera.position);
      const upp = this.unitsPerPixel(distToCam);
      const rawScale = THREE.MathUtils.clamp((TRAIN_MIN_PX * upp) / TRAIN_LENGTH, 1.0, 60);
      st.group.scale.setScalar(Math.max(rawScale * easeInOutCubic(st.appear), 0.001));

      if (st.track) {
        const tSince = now - st.tUpdate;
        // "Carrot": dead-reckoned true position; stops advancing once data goes stale
        const carrot = THREE.MathUtils.clamp(
          st.sTarget + st.vel * Math.min(tSince, STALE_CAP), 0, st.track.total);
        const err = (carrot - st.s) * st.dirSign;

        // Speed controller: cruise at the inferred speed floored at a crawl,
        // catch up when behind the carrot, ease to a creep (never reverse) when ahead
        let ctrl: number;
        if (stopped) {
          ctrl = err > 1.5 ? Math.min(0.5 * err, MAX_TRAIN_SPEED * 0.7) : 0;
        } else {
          const cruise = Math.max(Math.abs(st.vel), CRAWL_SPEED);
          const minCreep = err < -5 ? 0 : CRAWL_SPEED * 0.3;
          ctrl = THREE.MathUtils.clamp(cruise + 0.12 * err, minCreep, MAX_TRAIN_SPEED);
        }
        st.dispSpeed = THREE.MathUtils.damp(st.dispSpeed, ctrl * st.dirSign, 3, dt);
        st.s = THREE.MathUtils.clamp(st.s + st.dispSpeed * dt, 0, st.track.total);
        st.track.pointAt(st.s, this.v1);
        st.group.position.copy(this.v1);

        // Heading follows actual motion, with hysteresis so dwelling trains don't spin
        if (Math.abs(st.dispSpeed) > 0.05) {
          st.track.tangentAt(st.s, this.v2);
          const dir = Math.sign(st.dispSpeed);
          const targetYaw = Math.atan2(this.v2.x * dir, this.v2.z * dir);
          let delta = targetYaw - st.yaw;
          while (delta > Math.PI) delta -= 2 * Math.PI;
          while (delta < -Math.PI) delta += 2 * Math.PI;
          st.yaw += delta * Math.min(1, dt * 5);
        }
        st.group.rotation.y = st.yaw;
      } else {
        st.group.position.x = THREE.MathUtils.damp(st.group.position.x, st.raw.x, 1.9, dt);
        st.group.position.z = THREE.MathUtils.damp(st.group.position.z, st.raw.z, 1.9, dt);
        st.group.rotation.y = Math.PI - THREE.MathUtils.degToRad(st.data.bearing || 0);
      }

      // Dim the glow at far zoom so overlapping branches don't bloom into blobs
      const glowDim = 1 - 0.55 * THREE.MathUtils.smoothstep(rawScale, 20, 60);
      (st.glow.material as THREE.SpriteMaterial).opacity =
        (stopped ? 0.3 + 0.12 * Math.sin(now * 2.4) : 0.5) * glowDim;
    }

    this.updateStopScales();

    // Current-stop pulse
    if (this.pulseRing && this.currentStopGroup) {
      const t = (now % 1.8) / 1.8;
      const s = 2 + t * 4.5;
      this.pulseRing.scale.setScalar(s);
      this.pulseRing.material.opacity = 0.75 * (1 - easeInOutCubic(t));
      const camDist = this.currentStopGroup.position.distanceTo(this.camera.position);
      const upp = this.unitsPerPixel(camDist);
      this.currentStopGroup.scale.setScalar(THREE.MathUtils.clamp((7 * upp) / 2.1, 0.8, 30));
    }

    // Tile streaming (throttled)
    if (now - this.lastTileRefresh > 0.2) {
      this.lastTileRefresh = now;
      this.refreshTiles();
    }
    this.tiles.update(dt);

    this.renderer.render(this.scene, this.camera);
  };

  private refreshTiles() {
    // Anchor coverage on the orbit target — the frustum bbox explodes when the
    // view tilts, which left foreground gaps and made tiles pop during pans
    const height = Math.max(this.camera.position.y, 5);
    this.tiles.cover(this.controls.target.x, this.controls.target.z, height);
  }

  // ── Picking ───────────────────────────────────────────────────────────

  private setPointer(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  private pick(): { kind: "train" | "stop"; id: string } | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const trainHits = this.raycaster.intersectObjects(this.trainsGroup.children, true);
    for (const h of trainHits) {
      if (h.object instanceof THREE.Sprite) continue; // glow halo isn't a hit target
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.vehicleId) o = o.parent;
      if (o?.userData.vehicleId) return { kind: "train", id: o.userData.vehicleId };
    }
    if (this.stopRingMesh) {
      const stopHits = this.raycaster.intersectObject(this.stopRingMesh);
      const idx = stopHits[0]?.instanceId;
      if (idx !== undefined && this.stopIds[idx]) return { kind: "stop", id: this.stopIds[idx] };
    }
    if (this.stopMesh) {
      const stopHits = this.raycaster.intersectObject(this.stopMesh);
      const idx = stopHits[0]?.instanceId;
      if (idx !== undefined && this.stopIds[idx]) return { kind: "stop", id: this.stopIds[idx] };
    }
    return null;
  }

  private onPointerMove = (e: PointerEvent) => {
    this.setPointer(e);
    if (!this.opts.onHover) return;
    if (this.pointerDownAt) return; // dragging the map — no hover churn
    const hit = this.pick();
    if (!hit) {
      this.renderer.domElement.style.cursor = "";
      this.opts.onHover(null, e.clientX, e.clientY);
      return;
    }
    this.renderer.domElement.style.cursor = "pointer";
    if (hit.kind === "train") {
      const st = this.trains.get(hit.id);
      if (!st) return;
      const v = st.data;
      const mph = v.speed !== null ? Math.round(v.speed) : Math.round(Math.abs(st.vel) / WORLD_SCALE * 2.237);
      const moving = v.status === "STOPPED_AT" ? "Stopped at station" : `${mph} mph`;
      this.opts.onHover(
        { kind: "train", title: `${v.branch} · ${v.headsign}`, subtitle: moving },
        e.clientX, e.clientY
      );
    } else {
      this.opts.onHover(
        { kind: "stop", title: this.stopNames.get(hit.id) ?? hit.id, subtitle: "Click for departures" },
        e.clientX, e.clientY
      );
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    this.fly = null; // user takes over the camera
    this.pointerDownAt = { x: e.clientX, y: e.clientY };
  };

  private onWheelCapture = () => {
    this.fly = null; // user takes over the camera
  };

  private onPointerUp = (e: PointerEvent) => {
    const down = this.pointerDownAt;
    this.pointerDownAt = null;
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    this.setPointer(e);
    const hit = this.pick();
    if (hit?.kind === "stop") this.opts.onStopClick?.(hit.id);
  };

  private onPointerLeave = () => {
    this.pointerDownAt = null;
    this.opts.onHover?.(null, 0, 0);
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.opts.onError?.("The map's graphics context was lost.");
  };

  // ── Plumbing ──────────────────────────────────────────────────────────

  private updateLineResolution() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    for (const m of this.lineMaterials) m.resolution.set(w, h);
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.updateLineResolution();
    this.lastStopCam.set(Infinity, Infinity, Infinity); // pixel sizes changed
  }

  /** Remove and dispose everything in a group, keeping shared geometries alive. */
  private clearGroup(group: THREE.Group) {
    const disposeObject = (obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry && !this.sharedGeometries.has(mesh.geometry)) mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) m.dispose();
    };
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse(disposeObject);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    const dom = this.renderer.domElement;
    dom.removeEventListener("pointermove", this.onPointerMove);
    dom.removeEventListener("pointerdown", this.onPointerDown, true);
    dom.removeEventListener("wheel", this.onWheelCapture, { capture: true });
    dom.removeEventListener("pointerup", this.onPointerUp);
    dom.removeEventListener("pointerleave", this.onPointerLeave);
    dom.removeEventListener("webglcontextlost", this.onContextLost);
    this.controls.dispose();
    for (const st of this.trains.values()) this.disposeTrain(st);
    this.trains.clear();
    this.clearGroup(this.routesGroup);
    this.clearGroup(this.stopsGroup);
    for (const m of this.lineMaterials) m.dispose();
    this.tiles.dispose();
    this.glowTexture.dispose();
    for (const g of this.sharedGeometries) g.dispose();
    this.renderer.dispose();
    dom.remove();
  }
}
