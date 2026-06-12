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
const EXTRAPOLATE_CAP = 14; // seconds to dead-reckon past the last API update

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
}

// ── Arc-length parameterized polyline ───────────────────────────────────

class TrackLine {
  readonly points: THREE.Vector3[] = [];
  private cum: number[] = [];
  total = 0;

  constructor(latLons: [number, number][]) {
    let prev: THREE.Vector3 | null = null;
    for (const [lat, lon] of latLons) {
      const { x, z } = project(lat, lon);
      const p = new THREE.Vector3(x, TRAIN_Y, z);
      if (prev && prev.distanceToSquared(p) < 1e-6) continue;
      this.points.push(p);
      this.cum.push(prev ? this.total += prev.distanceTo(p) : 0);
      prev = p;
    }
  }

  private locate(s: number): { i: number; t: number } {
    const clamped = THREE.MathUtils.clamp(s, 0, this.total);
    let lo = 0, hi = this.cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= clamped) lo = mid; else hi = mid;
    }
    const segLen = this.cum[hi] - this.cum[lo];
    return { i: lo, t: segLen > 0 ? (clamped - this.cum[lo]) / segLen : 0 };
  }

  pointAt(s: number, out: THREE.Vector3): THREE.Vector3 {
    if (this.points.length === 0) return out.set(0, TRAIN_Y, 0);
    if (this.points.length === 1) return out.copy(this.points[0]);
    const { i, t } = this.locate(s);
    return out.copy(this.points[i]).lerp(this.points[i + 1], t);
  }

  tangentAt(s: number, out: THREE.Vector3): THREE.Vector3 {
    if (this.points.length < 2) return out.set(0, 0, 1);
    const { i } = this.locate(s);
    return out.copy(this.points[i + 1]).sub(this.points[i]).normalize();
  }

  /** Closest arc-length position to a world point (brute force over segments). */
  nearest(p: THREE.Vector3): { s: number; dist: number } {
    let bestS = 0, bestD = Infinity;
    const ab = new THREE.Vector3(), ap = new THREE.Vector3(), proj = new THREE.Vector3();
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i], b = this.points[i + 1];
      ab.copy(b).sub(a);
      const len2 = ab.lengthSq();
      const t = len2 > 0 ? THREE.MathUtils.clamp(ap.copy(p).sub(a).dot(ab) / len2, 0, 1) : 0;
      proj.copy(a).addScaledVector(ab, t);
      const d = proj.distanceToSquared(p);
      if (d < bestD) {
        bestD = d;
        bestS = this.cum[i] + Math.sqrt(len2) * t;
      }
    }
    return { s: bestS, dist: Math.sqrt(bestD) };
  }
}

// ── Per-vehicle animation state ─────────────────────────────────────────

interface TrainState {
  group: THREE.Group;
  body: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  tip: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  glow: THREE.Sprite;
  track: TrackLine | null;
  s: number;          // animated arc position
  sTarget: number;    // last API arc position
  vel: number;        // inferred world units/s along the track (signed)
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
  private currentStopGroup: THREE.Group | null = null;
  private pulseRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null;

  // shared resources
  private glowTexture = makeGlowTexture();
  private trainBodyGeo = new THREE.BoxGeometry(0.62, 0.5, 2.1);
  private trainTipGeo = new THREE.BoxGeometry(0.5, 0.52, 0.42);
  private stopGeo = new THREE.CylinderGeometry(1, 1, 0.45, 20);

  // fly-to tween
  private fly: {
    t0: number; dur: number;
    fromPos: THREE.Vector3; toPos: THREE.Vector3;
    fromTarget: THREE.Vector3; toTarget: THREE.Vector3;
  } | null = null;

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

    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0a0a0e);
    this.scene.fog = new THREE.FogExp2(0x0a0a0e, 0.00011);

    this.camera = new THREE.PerspectiveCamera(55, w / h, 1, 60000);
    this.camera.position.set(0, 380, 230);

    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.zoomToCursor = true;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 18;
    this.controls.maxDistance = 6500;
    this.controls.maxPolarAngle = 1.25; // keep camera above the ground
    this.controls.target.set(0, 0, 0);

    // Base ground plane under the tiles
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200000, 200000),
      new THREE.MeshBasicMaterial({ color: 0x0c0c10 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.renderOrder = -1;
    this.scene.add(ground);

    this.scene.add(new THREE.HemisphereLight(0x95a3c4, 0x0a0a12, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(300, 600, -200);
    this.scene.add(sun);

    this.tiles.group.renderOrder = 0;
    this.scene.add(this.tiles.group, this.routesGroup, this.stopsGroup, this.trainsGroup);

    const dom = this.renderer.domElement;
    dom.addEventListener("pointermove", this.onPointerMove);
    dom.addEventListener("pointerdown", this.onPointerDown);
    dom.addEventListener("pointerup", this.onPointerUp);
    dom.addEventListener("pointerleave", this.onPointerLeave);

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
      const track = new TrackLine(latLons);
      if (track.points.length < 2) continue;
      this.tracks.set(key, track);

      const positions: number[] = [];
      for (const p of track.points) {
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
        opacity: 0.92,
        depthWrite: false,
      });
      const halo = new LineMaterial({
        color: new THREE.Color(color).getHex(),
        linewidth: 11,
        transparent: true,
        opacity: 0.13,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.lineMaterials.push(core, halo);

      const coreLine = new Line2(geo, core);
      const haloLine = new Line2(geo, halo);
      coreLine.renderOrder = 31;
      haloLine.renderOrder = 30;
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
    this.currentStopGroup = null;
    this.pulseRing = null;
    this.stopIds = [];
    this.stopNames.clear();

    if (stops.length > 0) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.95 });
      const inst = new THREE.InstancedMesh(this.stopGeo, mat, stops.length);
      const m = new THREE.Matrix4();
      stops.forEach((stop, i) => {
        const { x, z } = project(stop.lat, stop.lon);
        m.makeScale(1.5, 1, 1.5).setPosition(x, STOP_Y, z);
        inst.setMatrixAt(i, m);
        this.stopIds.push(stop.id);
        if (stop.name) this.stopNames.set(stop.id, stop.name);
      });
      inst.renderOrder = 35;
      this.stopsGroup.add(inst);
      this.stopMesh = inst;
    }

    if (currentStopId) {
      const cur = stops.find(s => s.id === currentStopId);
      if (cur) {
        const { x, z } = project(cur.lat, cur.lon);
        const group = new THREE.Group();
        group.position.set(x, STOP_Y, z);

        const puck = new THREE.Mesh(
          this.stopGeo,
          new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        puck.scale.set(2.1, 1.4, 2.1);
        puck.renderOrder = 36;

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1, 1.18, 48),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.3;
        ring.renderOrder = 36;

        group.add(puck, ring);
        this.stopsGroup.add(group);
        this.currentStopGroup = group;
        this.pulseRing = ring as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
      }
    }
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
        }
        if (v.status === "STOPPED_AT") st.vel = 0;
        st.sTarget = hit.s;
        st.apiUpdatedAt = apiTs ?? st.apiUpdatedAt;
      }
      st.tUpdate = now;
      st.data = v;
      st.body.material.color.set(colorFor(v.route));
      st.body.material.emissive.set(colorFor(v.route));
      (st.glow.material as THREE.SpriteMaterial).color.set(colorFor(v.route));
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
    body.renderOrder = 40;

    const tip = new THREE.Mesh(
      this.trainTipGeo,
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.4 })
    );
    tip.position.z = 1.05;
    tip.renderOrder = 40;

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTexture,
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    glow.scale.setScalar(7);
    glow.renderOrder = 39;

    group.add(glow, body, tip);
    group.position.y = TRAIN_Y;
    group.userData.vehicleId = v.id;
    this.trainsGroup.add(group);

    return {
      group, body, tip, glow,
      track: null,
      s: 0, sTarget: 0, vel: 0,
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
    this.startFly(target, pos, duration);
  }

  private flyToBox(bbox: THREE.Box3, duration = 1.8) {
    const center = bbox.getCenter(new THREE.Vector3());
    center.y = 0;
    const size = bbox.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.z, 30);
    const height = THREE.MathUtils.clamp(extent * 0.95, 60, 5800);
    const pos = center.clone().add(new THREE.Vector3(0, height, height * 0.5));
    this.startFly(center, pos, duration);
  }

  private startFly(target: THREE.Vector3, pos: THREE.Vector3, duration: number) {
    this.fly = {
      t0: this.nowSec(),
      dur: duration,
      fromPos: this.camera.position.clone(),
      toPos: pos,
      fromTarget: this.controls.target.clone(),
      toTarget: target,
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

    // Fly tween (user input cancels it via pointerdown)
    if (this.fly) {
      const f = this.fly;
      const t = THREE.MathUtils.clamp((now - f.t0) / f.dur, 0, 1);
      const e = easeInOutCubic(t);
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, e);
      this.camera.position.lerpVectors(f.fromPos, f.toPos, e);
      // gentle altitude arc so long hops feel like flight
      const hop = f.fromPos.distanceTo(f.toPos) * 0.12 * Math.sin(Math.PI * e);
      this.camera.position.y += hop;
      if (t >= 1) this.fly = null;
    }
    this.controls.update();

    // Trains
    for (const st of this.trains.values()) {
      st.appear = Math.min(1, st.appear + dt * 2);
      const distToCam = st.group.position.distanceTo(this.camera.position);
      const scale = THREE.MathUtils.clamp(distToCam * 0.011, 1.1, 15) * easeInOutCubic(st.appear);
      st.group.scale.setScalar(Math.max(scale, 0.001));

      if (st.track) {
        const tSince = Math.min(now - st.tUpdate, EXTRAPOLATE_CAP);
        const predicted = THREE.MathUtils.clamp(st.sTarget + st.vel * tSince, 0, st.track.total);
        st.s = THREE.MathUtils.damp(st.s, predicted, 1.9, dt);
        st.track.pointAt(st.s, this.v1);
        st.group.position.copy(this.v1);

        st.track.tangentAt(st.s, this.v2);
        const dir = st.vel !== 0 ? Math.sign(st.vel) : (st.data.directionId === 1 ? 1 : -1);
        const targetYaw = Math.atan2(this.v2.x * dir, this.v2.z * dir);
        let delta = targetYaw - st.yaw;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        st.yaw += delta * Math.min(1, dt * 5);
        st.group.rotation.y = st.yaw;
      } else {
        st.group.position.x = THREE.MathUtils.damp(st.group.position.x, st.raw.x, 1.9, dt);
        st.group.position.z = THREE.MathUtils.damp(st.group.position.z, st.raw.z, 1.9, dt);
        st.group.rotation.y = Math.PI - THREE.MathUtils.degToRad(st.data.bearing || 0);
      }

      const stopped = st.data.status === "STOPPED_AT";
      (st.glow.material as THREE.SpriteMaterial).opacity = stopped
        ? 0.3 + 0.12 * Math.sin(now * 2.4)
        : 0.5;
    }

    // Current-stop pulse
    if (this.pulseRing && this.currentStopGroup) {
      const t = (now % 1.8) / 1.8;
      const s = 2 + t * 4.5;
      this.pulseRing.scale.setScalar(s);
      this.pulseRing.material.opacity = 0.75 * (1 - easeInOutCubic(t));
      const camDist = this.currentStopGroup.position.distanceTo(this.camera.position);
      this.currentStopGroup.scale.setScalar(THREE.MathUtils.clamp(camDist * 0.004, 0.8, 6));
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
    const height = Math.max(this.camera.position.y, 5);
    const corners: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const hit = this.v1;
    for (const [nx, ny] of corners) {
      this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
      const got = this.raycaster.ray.intersectPlane(plane, hit);
      const maxReach = height * 5;
      if (!got || hit.distanceTo(this.camera.position) > maxReach) {
        // grazing ray: clamp to a point ahead of the camera
        hit.copy(this.raycaster.ray.direction).multiplyScalar(maxReach).add(this.camera.position);
      }
      minX = Math.min(minX, hit.x); maxX = Math.max(maxX, hit.x);
      minZ = Math.min(minZ, hit.z); maxZ = Math.max(maxZ, hit.z);
    }
    this.tiles.cover(minX, maxX, minZ, maxZ, height);
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
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.vehicleId) o = o.parent;
      if (o?.userData.vehicleId) return { kind: "train", id: o.userData.vehicleId };
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
      const moving = v.status === "STOPPED_AT" ? "Stopped" : `${mph} mph`;
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

  private onPointerUp = (e: PointerEvent) => {
    const down = this.pointerDownAt;
    this.pointerDownAt = null;
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    this.setPointer(e);
    const hit = this.pick();
    if (hit?.kind === "stop") this.opts.onStopClick?.(hit.id);
  };

  private onPointerLeave = () => {
    this.opts.onHover?.(null, 0, 0);
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
  }

  private clearGroup(group: THREE.Group) {
    for (const child of [...group.children]) {
      group.remove(child);
      const mesh = child as THREE.Mesh;
      if (mesh.geometry && mesh.geometry !== this.stopGeo) mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) m.dispose();
      if ((child as THREE.Group).children?.length) {
        for (const sub of child.children) {
          const sm = sub as THREE.Mesh;
          if (sm.geometry && sm.geometry !== this.stopGeo) sm.geometry.dispose();
          const subMats = Array.isArray(sm.material) ? sm.material : sm.material ? [sm.material] : [];
          for (const m of subMats) m.dispose();
        }
      }
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    const dom = this.renderer.domElement;
    dom.removeEventListener("pointermove", this.onPointerMove);
    dom.removeEventListener("pointerdown", this.onPointerDown);
    dom.removeEventListener("pointerup", this.onPointerUp);
    dom.removeEventListener("pointerleave", this.onPointerLeave);
    this.controls.dispose();
    for (const st of this.trains.values()) this.disposeTrain(st);
    this.trains.clear();
    this.clearGroup(this.routesGroup);
    this.clearGroup(this.stopsGroup);
    for (const m of this.lineMaterials) m.dispose();
    this.tiles.dispose();
    this.glowTexture.dispose();
    this.trainBodyGeo.dispose();
    this.trainTipGeo.dispose();
    this.stopGeo.dispose();
    this.renderer.dispose();
    dom.remove();
  }
}
