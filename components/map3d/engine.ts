import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import type { Vehicle } from "@/types/mbta";
import { project, WORLD_SCALE } from "@/lib/geo";
import { VectorWorld } from "./tiles";

// Heights above the ground plane, in world units (1 unit = 20 m)
const ROUTE_Y = 0.6;
const STOP_Y = 0.7;
const TRAIN_Y = 0.75;

const MAX_TRAIN_SPEED = 3.5; // world units/s ≈ 156 mph — sanity cap for inference
const CRAWL_SPEED = 0.45;    // ≈ 20 mph — minimum display speed for in-transit trains
const STALE_CAP = 20;        // seconds of dead-reckoning before the carrot stops advancing

// On-screen size floors so markers stay legible at every zoom
const TRAIN_MIN_PX = 22;     // train length up close…
const TRAIN_FAR_PX = 13;     // …and zoomed out over the whole network
const STOP_MIN_PX = 6;       // stop ring radius
const TRAIN_LENGTH = 2.1;
const STOP_RING_RADIUS = 1.45;

// Station labels appear once a pixel covers less than this many world units
const LABEL_MAX_UPP = 0.9;

// Camera limits
const MIN_DISTANCE = 18;
const MAX_DISTANCE = 7000;
/** Default viewing azimuth — a slight isometric twist reads as "game board". */
const AZIMUTH = -0.38;

// Palette
const SKY_TOP = "#7CC7FF";
const SKY_MID = "#BCE5FF";
const HORIZON = "#F4EFE3";
const LAND = "#EFE8D6";

/**
 * Overlay draw order (overlay pass only; depth is cleared before it so the
 * transit layer always reads on top of buildings).
 */
const ORDER = {
  routeHalo: 30,
  routeCore: 31,
  stopRing: 35,
  stopCore: 36,
  currentStop: 37,
  trainShadow: 38,
  train: 40,
} as const;

export interface HoverInfo {
  kind: "train" | "stop";
  title: string;
  subtitle: string;
}

export interface FollowInfo {
  id: string;
  title: string;
  subtitle: string;
  color: string;
}

export interface StopDatum {
  id: string;
  lat: number;
  lon: number;
  name?: string;
  /** Ring color; falls back to the setStops default. */
  color?: string;
  /** Line this marker belongs to (overview mode spans several). */
  lineId?: string;
  /** Served by more than one line — drawn as a white interchange. */
  transfer?: boolean;
}

export interface Padding { top: number; right: number; bottom: number; left: number }

interface EngineOptions {
  onStopClick?: (stop: StopDatum, x: number, y: number) => void;
  onHover?: (info: HoverInfo | null, x: number, y: number) => void;
  onFollow?: (info: FollowInfo | null) => void;
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
  model: THREE.Group;
  bodyMat: THREE.MeshLambertMaterial;
  color: string;
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
  appear: number;     // 0→1 spawn pop
  phase: number;      // idle bob offset
  data: Vehicle;
}

interface Label {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  w: number;
  current: boolean;
  shown: boolean;
}

function makeSkyTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, SKY_TOP);
  g.addColorStop(0.45, SKY_MID);
  g.addColorStop(0.8, HORIZON);
  g.addColorStop(1, HORIZON);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeShadowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(40,40,70,0.55)");
  grad.addColorStop(0.6, "rgba(40,40,70,0.25)");
  grad.addColorStop(1, "rgba(40,40,70,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutBack(t: number) {
  const c1 = 1.7, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8ccb4, 1.55));
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.9);
  // low from the south-west so the camera-facing walls catch the light
  sun.position.set(-420, 620, 520);
  scene.add(sun);
}

// ── Engine ──────────────────────────────────────────────────────────────

export class MapEngine {
  private renderer: THREE.WebGLRenderer;
  /** Pass 1: sky, land and flat vector features (no depth). */
  private groundScene = new THREE.Scene();
  /** Pass 2: extruded buildings (depth-tested). */
  private buildingScene = new THREE.Scene();
  /** Pass 3: routes, stations, trains — drawn over a cleared depth buffer. */
  private overlayScene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: MapControls;
  private fog = new THREE.FogExp2(HORIZON, 0.0005);
  private startMs = performance.now();
  private lastMs = performance.now();
  private raf = 0;
  private disposed = false;

  private world = new VectorWorld();
  private routesGroup = new THREE.Group();
  private stopsGroup = new THREE.Group();
  private trainsGroup = new THREE.Group();
  private lineMaterials: LineMaterial[] = [];

  private tracks = new Map<string, TrackLine>();
  private trains = new Map<string, TrainState>();
  private stops: StopDatum[] = [];
  private stopMesh: THREE.InstancedMesh | null = null;
  private stopRingMesh: THREE.InstancedMesh | null = null;
  private stopBase: THREE.Vector3[] = [];
  private lastStopCam = new THREE.Vector3(Infinity, Infinity, Infinity);
  private currentStopGroup: THREE.Group | null = null;
  private pulseRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null;
  private labelLayer: HTMLDivElement;
  private labels: Label[] = [];

  // shared resources (never disposed by clearGroup)
  private skyTexture = makeSkyTexture();
  private shadowTexture = makeShadowTexture();
  private trainBodyGeo = new THREE.BoxGeometry(0.7, 0.44, TRAIN_LENGTH);
  private trainBandGeo = new THREE.BoxGeometry(0.72, 0.15, TRAIN_LENGTH * 0.82);
  private trainRoofGeo = new THREE.BoxGeometry(0.22, 0.08, TRAIN_LENGTH * 0.72);
  private trainNoseGeo = new THREE.BoxGeometry(0.5, 0.16, 0.08);
  private trainShadowGeo = new THREE.PlaneGeometry(1.5, TRAIN_LENGTH * 1.35);
  private stopGeo = new THREE.CylinderGeometry(1, 1, 0.5, 24);
  private stopRingGeo = new THREE.RingGeometry(1.0, STOP_RING_RADIUS, 32);
  private sharedGeometries: Set<THREE.BufferGeometry>;
  private bandMat = new THREE.MeshLambertMaterial({ color: 0x232a4a });
  private roofMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private noseMat = new THREE.MeshBasicMaterial({ color: 0xfff1a8 });
  private shadowMat: THREE.MeshBasicMaterial;
  private sharedMaterials: Set<THREE.Material>;

  // fly-to tween
  private fly: {
    t0: number; dur: number;
    fromPos: THREE.Vector3; toPos: THREE.Vector3;
    fromTarget: THREE.Vector3; toTarget: THREE.Vector3;
    arc: boolean;
  } | null = null;

  /** Where "reset view" returns to: the last fitted route bbox or fly-to stop. */
  private home: { target: THREE.Vector3; pos: THREE.Vector3 } | null = null;
  private follow: string | null = null;

  // screen space reserved by floating windows; the camera centers in what's left
  private padTarget: Padding = { top: 0, right: 0, bottom: 0, left: 0 };
  private pad: Padding = { top: 0, right: 0, bottom: 0, left: 0 };

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDownAt: { x: number; y: number } | null = null;
  private dragging = false;
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
    this.sharedGeometries = new Set([
      this.trainBodyGeo, this.trainBandGeo, this.trainRoofGeo, this.trainNoseGeo, this.trainShadowGeo,
      this.stopGeo, this.stopRingGeo,
    ]);
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTexture, transparent: true, depthWrite: false, depthTest: false,
    });
    this.sharedMaterials = new Set([this.bandMat, this.roofMat, this.noseMat, this.shadowMat]);

    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.autoClear = false;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.setAttribute("aria-label", "Interactive 3D network map");
    container.appendChild(this.renderer.domElement);

    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "map-labels";
    container.appendChild(this.labelLayer);

    this.groundScene.background = this.skyTexture;
    this.groundScene.fog = this.fog;
    this.buildingScene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(45, w / h, 1, 60000);
    this.camera.position.set(0, 380, 330);

    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.zoomToCursor = true;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = MIN_DISTANCE;
    this.controls.maxDistance = MAX_DISTANCE;
    this.controls.maxPolarAngle = 1.2; // ≈ 69° — lets you tilt down to street level-ish
    this.controls.target.set(0, 0, 0);

    // Land under the tiles; the vector ground paints on top of it
    const land = new THREE.Mesh(
      new THREE.PlaneGeometry(400000, 400000),
      new THREE.MeshBasicMaterial({ color: LAND, depthWrite: false, depthTest: false })
    );
    land.rotation.x = -Math.PI / 2;
    land.renderOrder = -100;
    this.groundScene.add(land, this.world.ground);

    addLights(this.buildingScene);
    this.buildingScene.add(this.world.buildings);

    addLights(this.overlayScene);
    this.overlayScene.add(this.routesGroup, this.stopsGroup, this.trainsGroup);

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
      for (const p of simplifyXZ(raw, 0.6)) {
        positions.push(p.x, ROUTE_Y, p.z);
        bbox.expandByPoint(p);
      }
      const geo = new LineGeometry();
      geo.setPositions(positions);
      const color = colors[key] ?? "#ffffff";

      // Flat "board game" track: a white casing with a bold colored core
      const core = new LineMaterial({
        color: new THREE.Color(color).getHex(),
        linewidth: 5,
        depthTest: false,
        depthWrite: false,
      });
      const casing = new LineMaterial({
        color: 0xffffff,
        linewidth: 9.5,
        depthTest: false,
        depthWrite: false,
      });
      this.lineMaterials.push(core, casing);

      const coreLine = new Line2(geo, core);
      const casingLine = new Line2(geo, casing);
      coreLine.renderOrder = ORDER.routeCore;
      casingLine.renderOrder = ORDER.routeHalo;
      coreLine.computeLineDistances();
      casingLine.computeLineDistances();
      this.routesGroup.add(casingLine, coreLine);
    }
    this.updateLineResolution();

    // Re-snap live trains onto the fresh tracks
    for (const st of this.trains.values()) {
      const hit = this.snap(st.data.route, st.raw, null);
      st.track = hit?.track ?? null;
      if (hit) {
        st.s = hit.s;
        st.sTarget = hit.s;
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
    this.stops = stops;
    this.lastStopCam.set(Infinity, Infinity, Infinity);
    for (const l of this.labels) l.el.remove();
    this.labels = [];

    if (stops.length > 0) {
      // Station pucks: white core + line-colored ring, screen-size-scaled per frame
      const coreMat = new THREE.MeshLambertMaterial({ color: 0xffffff, depthTest: true });
      const core = new THREE.InstancedMesh(this.stopGeo, coreMat, stops.length);
      core.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const ringMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, depthTest: false, depthWrite: false });
      const ring = new THREE.InstancedMesh(this.stopRingGeo, ringMat, stops.length);
      ring.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const c = new THREE.Color();
      stops.forEach((stop, i) => {
        const { x, z } = project(stop.lat, stop.lon);
        this.stopBase.push(new THREE.Vector3(x, STOP_Y, z));
        ring.setColorAt(i, c.set(stop.transfer ? "#1d2433" : stop.color ?? color));
      });
      core.renderOrder = ORDER.stopCore;
      ring.renderOrder = ORDER.stopRing;
      this.stopsGroup.add(ring, core);
      this.stopMesh = core;
      this.stopRingMesh = ring;
      this.updateStopScales(true);
    }

    // HTML name tags, shown when zoomed in close enough to read them
    stops.forEach((stop, i) => {
      if (!stop.name) return;
      const el = document.createElement("div");
      const current = stop.id === currentStopId;
      el.className = current ? "map-label map-label--current" : "map-label";
      el.style.setProperty("--dot", stop.transfer ? "#1d2433" : stop.color ?? color);
      el.textContent = stop.name;
      el.style.display = "none";
      this.labelLayer.appendChild(el);
      this.labels.push({ el, pos: this.stopBase[i], w: stop.name.length * 6.6 + 30, current, shown: false });
    });
    // current stop label wins every collision
    this.labels.sort((a, b) => Number(b.current) - Number(a.current));

    if (currentStopId) {
      const cur = stops.find(s => s.id === currentStopId);
      if (cur) {
        const { x, z } = project(cur.lat, cur.lon);
        const group = new THREE.Group();
        group.position.set(x, STOP_Y, z);
        const ringColor = new THREE.Color(cur.color ?? color);

        const puck = new THREE.Mesh(this.stopGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }));
        puck.scale.set(2.1, 1.6, 2.1);
        puck.renderOrder = ORDER.currentStop;

        const halo = new THREE.Mesh(
          this.stopRingGeo,
          new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide, depthTest: false, depthWrite: false })
        );
        halo.rotation.x = -Math.PI / 2;
        halo.scale.setScalar(2.3);
        halo.position.y = 0.05;
        halo.renderOrder = ORDER.currentStop;

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1, 1.22, 48),
          new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false })
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
      const big = this.stops[i]?.transfer ? 1.25 : 1;
      m.compose(p, upright, sc.set(0.85 * k * big, Math.min(k, 3), 0.85 * k * big));
      core.setMatrixAt(i, m);
      m.compose(p, flat, sc.set(k * big, k * big, 1));
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
        const hit = this.snap(v.route, st.raw, null);
        st.track = hit?.track ?? null;
        if (hit) st.s = st.sTarget = hit.s;
        st.tUpdate = now;
        st.apiUpdatedAt = v.updatedAt ? Date.parse(v.updatedAt) : null;
        this.trains.set(v.id, st);
        continue;
      }

      st.raw.set(x, TRAIN_Y, z);
      const hit = this.snap(v.route, st.raw, st.track);
      if (hit && hit.track !== st.track) {
        // switched branch: jump onto the new track rather than sliding along the old one
        st.track = hit.track;
        st.s = st.sTarget = hit.s;
        st.vel = 0;
        // keep the train facing the same way on the new track's parameterization
        hit.track.tangentAt(hit.s, this.v2);
        st.dirSign = this.v2.x * Math.sin(st.yaw) + this.v2.z * Math.cos(st.yaw) >= 0 ? 1 : -1;
      }
      const track = st.track;

      if (track && hit) {
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
      st.color = color;
      st.bodyMat.color.set(color);
    }

    for (const [id, st] of this.trains) {
      if (!seen.has(id)) {
        this.disposeTrain(st);
        this.trains.delete(id);
        if (this.follow === id) this.stopFollowing();
      }
    }
    if (this.follow) this.emitFollow();
  }

  /** A chunky toy train: colored body, dark window band, white roof stripe, headlight. */
  /**
   * Nearest track for a vehicle on `route`, across its branches ("Red",
   * "Red~1"…). Sticks with the current track unless another is clearly closer,
   * so trunk-section trains don't flicker between overlapping branches.
   */
  private snap(route: string, p: THREE.Vector3, current: TrackLine | null): { track: TrackLine; s: number } | null {
    let best: { track: TrackLine; s: number; dist: number } | null = null;
    let cur: { track: TrackLine; s: number; dist: number } | null = null;
    for (const [key, track] of this.tracks) {
      if (key !== route && !key.startsWith(`${route}~`)) continue;
      const { s, dist } = track.nearest(p);
      if (track === current) cur = { track, s, dist };
      if (!best || dist < best.dist) best = { track, s, dist };
    }
    if (cur && best && cur.dist < best.dist + 1.5) return cur;
    return best;
  }

  private spawnTrain(v: Vehicle, color: string): TrainState {
    const group = new THREE.Group();
    const model = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
    const body = new THREE.Mesh(this.trainBodyGeo, bodyMat);
    body.position.y = 0.26;
    const band = new THREE.Mesh(this.trainBandGeo, this.bandMat);
    band.position.y = 0.33;
    const roof = new THREE.Mesh(this.trainRoofGeo, this.roofMat);
    roof.position.y = 0.51;
    const nose = new THREE.Mesh(this.trainNoseGeo, this.noseMat);
    nose.position.set(0, 0.2, TRAIN_LENGTH / 2 + 0.02);
    for (const m of [body, band, roof, nose]) m.renderOrder = ORDER.train;
    model.add(body, band, roof, nose);

    const shadow = new THREE.Mesh(this.trainShadowGeo, this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.1;
    shadow.renderOrder = ORDER.trainShadow;

    group.add(shadow, model);
    group.position.y = TRAIN_Y;
    group.userData.vehicleId = v.id;
    this.trainsGroup.add(group);

    return {
      group, model, bodyMat, color,
      track: null,
      s: 0, sTarget: 0, vel: 0,
      dispSpeed: 0,
      dirSign: (v.directionId === 0 ? 1 : -1) as 1 | -1,
      tUpdate: this.nowSec(),
      apiUpdatedAt: null,
      raw: new THREE.Vector3(0, TRAIN_Y, 0),
      yaw: Math.PI - THREE.MathUtils.degToRad(v.bearing || 0),
      appear: 0,
      phase: Math.random() * Math.PI * 2,
      data: v,
    };
  }

  private disposeTrain(st: TrainState) {
    this.trainsGroup.remove(st.group);
    st.bodyMat.dispose();
  }

  // ── Camera ────────────────────────────────────────────────────────────

  /** Camera position for looking at `target` from `dist` away at a given tilt. */
  private viewFrom(target: THREE.Vector3, height: number, back: number): THREE.Vector3 {
    return target.clone().add(new THREE.Vector3(Math.sin(AZIMUTH) * back, height, Math.cos(AZIMUTH) * back));
  }

  flyTo(lat: number, lon: number, height: number, duration = 1.6) {
    const { x, z } = project(lat, lon);
    const target = new THREE.Vector3(x, 0, z);
    const pos = this.viewFrom(target, height, height * 0.95);
    this.home = { target: target.clone(), pos: pos.clone() };
    this.stopFollowing();
    this.startFly(target, pos, duration, true);
  }

  private flyToBox(bbox: THREE.Box3, duration = 1.8) {
    const center = bbox.getCenter(new THREE.Vector3());
    center.y = 0;
    const size = bbox.getSize(new THREE.Vector3());
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    const p = this.padTarget;
    const freeW = Math.max(w - p.left - p.right, w * 0.35);
    const freeH = Math.max(h - p.top - p.bottom, h * 0.35);
    const aspect = freeW / freeH;
    // Fit the wider axis in the unobscured part of the screen
    const extent = Math.max(size.x / Math.min(aspect, 1.6), size.z, 30) * (h / freeH);
    const height = THREE.MathUtils.clamp(extent * 0.95, 60, MAX_DISTANCE * 0.8);
    const pos = this.viewFrom(center, height, height * 0.7);
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
    this.stopFollowing();
    this.startFly(this.home.target.clone(), this.home.pos.clone(), duration, true);
  }

  /** Reserve screen space for floating windows; the view recenters smoothly. */
  setPadding(p: Padding) {
    this.padTarget = { ...p };
  }

  /** Chase-cam a live train until the user drags the map. */
  followTrain(id: string) {
    const st = this.trains.get(id);
    if (!st) return;
    this.follow = id;
    this.controls.zoomToCursor = false;
    const dist = this.camera.position.distanceTo(this.controls.target);
    if (dist > 160) {
      const target = st.group.position.clone().setY(0);
      this.startFly(target, this.viewFrom(target, 70, 80), 1.2, true);
    }
    this.emitFollow();
  }

  stopFollowing() {
    if (!this.follow) return;
    this.follow = null;
    this.controls.zoomToCursor = true;
    this.opts.onFollow?.(null);
  }

  private emitFollow() {
    const st = this.follow ? this.trains.get(this.follow) : null;
    if (!st) return;
    const v = st.data;
    const mph = v.speed !== null ? Math.round(v.speed) : Math.round(Math.abs(st.vel) / WORLD_SCALE * 2.237);
    this.opts.onFollow?.({
      id: v.id,
      title: v.headsign,
      subtitle: v.status === "STOPPED_AT" ? "At a station" : mph >= 1 ? `${mph} mph` : "In transit",
      color: st.color,
    });
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

    this.updatePadding(dt);

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
      if (this.follow) {
        const st = this.trains.get(this.follow);
        if (st) {
          this.v1.copy(st.group.position).setY(0).sub(this.controls.target).multiplyScalar(1 - Math.exp(-5 * dt));
          this.controls.target.add(this.v1);
          this.camera.position.add(this.v1);
        }
      }
      this.controls.update();
    }

    this.updateTrains(now, dt);
    this.updateStopScales();

    // Current-stop pulse
    if (this.pulseRing && this.currentStopGroup) {
      const t = (now % 1.8) / 1.8;
      const s = 2 + t * 4.5;
      this.pulseRing.scale.setScalar(s);
      this.pulseRing.material.opacity = 0.8 * (1 - easeInOutCubic(t));
      const camDist = this.currentStopGroup.position.distanceTo(this.camera.position);
      const upp = this.unitsPerPixel(camDist);
      this.currentStopGroup.scale.setScalar(THREE.MathUtils.clamp((7 * upp) / 2.1, 0.8, 30));
    }

    // Fog thickens with altitude so the horizon always melts into the sky
    const camDist = this.camera.position.distanceTo(this.controls.target);
    this.fog.density = 0.3 / Math.max(camDist, 40);

    // Tile streaming (throttled)
    if (now - this.lastTileRefresh > 0.2) {
      this.lastTileRefresh = now;
      this.world.cover(this.controls.target.x, this.controls.target.z, Math.max(this.camera.position.y, 5));
    }
    this.world.update(dt);

    const r = this.renderer;
    r.clear();
    r.render(this.groundScene, this.camera);
    r.render(this.buildingScene, this.camera);
    r.clearDepth();
    r.render(this.overlayScene, this.camera);

    this.updateLabels();
  };

  private updateTrains(now: number, dt: number) {
    for (const st of this.trains.values()) {
      const stopped = st.data.status === "STOPPED_AT";
      st.appear = Math.min(1, st.appear + dt * 1.6);
      const distToCam = st.group.position.distanceTo(this.camera.position);
      const upp = this.unitsPerPixel(distToCam);
      const px = THREE.MathUtils.lerp(TRAIN_MIN_PX, TRAIN_FAR_PX, THREE.MathUtils.smoothstep(upp, 1, 8));
      const rawScale = THREE.MathUtils.clamp((px * upp) / TRAIN_LENGTH, 1.0, 60);
      st.group.scale.setScalar(Math.max(rawScale * easeOutBack(st.appear), 0.001));

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

      // toy-like idle bob and a lean into acceleration
      const speed = Math.abs(st.dispSpeed);
      st.model.position.y = stopped ? 0.03 * Math.sin(now * 3 + st.phase) : 0.02 * Math.sin(now * 14 + st.phase) * Math.min(speed, 1);
      st.model.rotation.x = THREE.MathUtils.damp(st.model.rotation.x, -0.05 * THREE.MathUtils.clamp(speed - 0.5, 0, 1), 4, dt);
    }
  }

  /** Ease the view offset toward the space windows leave free. */
  private updatePadding(dt: number) {
    const p = this.pad, t = this.padTarget;
    const k = 1 - Math.exp(-6 * dt);
    let moved = false;
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const d = t[side] - p[side];
      if (Math.abs(d) > 0.25) { p[side] += d * k; moved = true; }
      else if (d !== 0) { p[side] = t[side]; moved = true; }
    }
    if (!moved) return;
    this.applyViewOffset();
  }

  private applyViewOffset() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    const p = this.pad;
    const ox = (p.right - p.left) / 2, oy = (p.bottom - p.top) / 2;
    if (Math.abs(ox) < 0.5 && Math.abs(oy) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, ox, oy, w, h);
    this.camera.updateProjectionMatrix();
    this.lastStopCam.set(Infinity, Infinity, Infinity);
  }

  /** Project station tags to screen and hide ones that would overlap. */
  private updateLabels() {
    if (this.labels.length === 0) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const upp = this.unitsPerPixel(this.camera.position.distanceTo(this.controls.target));
    const showAll = upp < LABEL_MAX_UPP;
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const l of this.labels) {
      let show = l.current || showAll;
      let sx = 0, sy = 0;
      if (show) {
        this.v1.copy(l.pos).project(this.camera);
        if (this.v1.z > 1 || this.v1.x < -1.1 || this.v1.x > 1.1 || this.v1.y < -1.1 || this.v1.y > 1.1) show = false;
        sx = (this.v1.x * 0.5 + 0.5) * w;
        sy = (-this.v1.y * 0.5 + 0.5) * h;
      }
      if (show) {
        const box = { x0: sx - l.w / 2, x1: sx + l.w / 2, y0: sy - 44, y1: sy - 16 };
        if (!l.current && placed.some(b => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) show = false;
        else placed.push(box);
      }
      if (show) {
        l.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
        if (!l.shown) { l.el.style.display = ""; l.shown = true; }
      } else if (l.shown) {
        l.el.style.display = "none";
        l.shown = false;
      }
    }
  }

  // ── Picking ───────────────────────────────────────────────────────────

  private setPointer(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  private pick(): { kind: "train" | "stop"; id: string; index?: number } | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const trainHits = this.raycaster.intersectObjects(this.trainsGroup.children, true);
    for (const h of trainHits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.vehicleId) o = o.parent;
      if (o?.userData.vehicleId) return { kind: "train", id: o.userData.vehicleId };
    }
    for (const mesh of [this.stopRingMesh, this.stopMesh]) {
      if (!mesh) continue;
      const idx = this.raycaster.intersectObject(mesh)[0]?.instanceId;
      if (idx !== undefined && this.stops[idx]) return { kind: "stop", id: this.stops[idx].id, index: idx };
    }
    return null;
  }

  private onPointerMove = (e: PointerEvent) => {
    this.setPointer(e);
    if (this.pointerDownAt) {
      if (!this.dragging && Math.hypot(e.clientX - this.pointerDownAt.x, e.clientY - this.pointerDownAt.y) > 6) {
        this.dragging = true;
        this.stopFollowing(); // grabbing the map takes the camera back
      }
      return; // dragging the map — no hover churn
    }
    if (!this.opts.onHover) return;
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
        { kind: "train", title: `${v.branch} · ${v.headsign}`, subtitle: `${moving} · click to follow` },
        e.clientX, e.clientY
      );
    } else {
      const stop = this.stops[hit.index!];
      this.opts.onHover(
        { kind: "stop", title: stop?.name ?? hit.id, subtitle: "Click for live departures" },
        e.clientX, e.clientY
      );
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    this.fly = null; // user takes over the camera
    this.pointerDownAt = { x: e.clientX, y: e.clientY };
    this.dragging = false;
  };

  private onWheelCapture = () => {
    this.fly = null; // user takes over the camera
  };

  private onPointerUp = (e: PointerEvent) => {
    const down = this.pointerDownAt;
    this.pointerDownAt = null;
    const wasDrag = this.dragging;
    this.dragging = false;
    if (!down || wasDrag || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    this.setPointer(e);
    const hit = this.pick();
    if (hit?.kind === "stop" && hit.index !== undefined) {
      this.opts.onHover?.(null, 0, 0);
      this.opts.onStopClick?.(this.stops[hit.index], e.clientX, e.clientY);
    } else if (hit?.kind === "train") {
      this.followTrain(hit.id);
    }
  };

  private onPointerLeave = () => {
    this.pointerDownAt = null;
    this.dragging = false;
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
    this.renderer.setSize(w, h);
    this.applyViewOffset();
    this.updateLineResolution();
  }

  /** Remove and dispose everything in a group, keeping shared resources alive. */
  private clearGroup(group: THREE.Group) {
    const disposeObject = (obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry && !this.sharedGeometries.has(mesh.geometry)) mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) if (!this.sharedMaterials.has(m)) m.dispose();
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
    this.world.dispose();
    this.skyTexture.dispose();
    this.shadowTexture.dispose();
    for (const g of this.sharedGeometries) g.dispose();
    for (const m of this.sharedMaterials) m.dispose();
    this.renderer.dispose();
    this.labelLayer.remove();
    dom.remove();
  }
}
