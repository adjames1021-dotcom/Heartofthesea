import * as THREE from 'three';
import { heightAt } from '../shared/waves.js';
import { diggableAt, groundAt, islandNear } from '../shared/world.js';
import { mulberry32 } from '../shared/noise.js';
import { paint, mergeParts, segment } from './props.js';
import { drawMap } from './mapview.js';
import { groundColorAt } from './terrain.js';
import { countOf } from '../shared/items.js';

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// Treasure on the client: maps you carry, digging, holes, chests and crabs.
// Where treasure is and whether a hole has it is the server's call, and the
// server keeps what you hold (src/progress.js); this side only draws and
// carries things.

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

const WOOD = '#76502f';
const WOOD_DARK = '#5a3b21';
const IRON = '#3b3d40';

function chestModel() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const body = [];
  const box = (w, h, d, x, y, z, c) => {
    const b = new THREE.BoxGeometry(w, h, d);
    b.translate(x, y, z);
    body.push(paint(b, c));
  };
  box(0.82, 0.4, 0.52, 0, 0.2, 0, WOOD);
  for (const y of [0.1, 0.22, 0.34]) box(0.83, 0.012, 0.53, 0, y, 0, WOOD_DARK); // plank seams
  for (const x of [-0.27, 0.27]) box(0.06, 0.41, 0.54, x, 0.2, 0, IRON);
  const base = new THREE.Mesh(mergeParts(body), mat);
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);
  // Lid on a hinge along the back edge.
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.4, -0.26);
  const lidParts = [];
  const lid = new THREE.BoxGeometry(0.84, 0.13, 0.54);
  lid.translate(0, 0.065, 0.26);
  lidParts.push(paint(lid, WOOD));
  for (const x of [-0.27, 0.27]) {
    const band = new THREE.BoxGeometry(0.06, 0.14, 0.56);
    band.translate(x, 0.065, 0.26);
    lidParts.push(paint(band, IRON));
  }
  const hasp = new THREE.BoxGeometry(0.1, 0.12, 0.03);
  hasp.translate(0, 0.0, 0.535);
  lidParts.push(paint(hasp, IRON));
  const lidMesh = new THREE.Mesh(mergeParts(lidParts), mat);
  lidMesh.castShadow = true;
  hinge.add(lidMesh);
  g.add(hinge);
  g.userData.lid = hinge;
  return g;
}

export function crabModel() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const parts = [];
  const body = new THREE.SphereGeometry(1, 8, 6);
  body.scale(0.17, 0.07, 0.12);
  body.translate(0, 0.1, 0);
  parts.push(paint(body, '#c4552b'));
  for (const s of [-1, 1]) {
    const claw = new THREE.SphereGeometry(1, 6, 5);
    claw.scale(0.06, 0.04, 0.045);
    claw.translate(s * 0.13, 0.11, 0.15);
    parts.push(paint(claw, '#d2643a'));
    parts.push(paint(segment(new THREE.Vector3(s * 0.08, 0.1, 0.08), new THREE.Vector3(s * 0.12, 0.11, 0.13), 0.015, 0.015, 4), '#b84d26'));
    for (let i = 0; i < 3; i++) {
      const x = s * (0.12 + i * 0.01);
      const z = 0.05 - i * 0.06;
      parts.push(paint(segment(new THREE.Vector3(s * 0.1, 0.09, z), new THREE.Vector3(x + s * 0.1, 0.0, z - 0.02), 0.01, 0.008, 3), '#a8461f'));
    }
    const eye = new THREE.SphereGeometry(0.018, 5, 4);
    eye.translate(s * 0.04, 0.19, 0.08);
    parts.push(paint(eye, '#1d1a17'));
  }
  const m = new THREE.Mesh(mergeParts(parts), mat);
  m.castShadow = true;
  g.add(m);
  return g;
}

/** A cask: bellied staves and two iron hoops. Stands on end. */
function barrelModel() {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector2(0.24 + 0.06 * Math.sin(t * Math.PI), t * 0.78));
  }
  const body = new THREE.LatheGeometry(pts, 12);
  const parts = [paint(body, '#6f5640')];
  for (const y of [0.16, 0.62]) {
    const hoop = new THREE.CylinderGeometry(0.285, 0.285, 0.05, 12, 1, true);
    hoop.translate(0, y, 0);
    parts.push(paint(hoop, '#3a3530'));
  }
  const lid = new THREE.CircleGeometry(0.24, 12);
  lid.rotateX(-Math.PI / 2);
  lid.translate(0, 0.78, 0);
  parts.push(paint(lid, '#5d4836'));
  // Stave seams.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(paint(segment(new THREE.Vector3(Math.cos(a) * 0.25, 0.02, Math.sin(a) * 0.25), new THREE.Vector3(Math.cos(a) * 0.25, 0.76, Math.sin(a) * 0.25), 0.012, 0.012, 3), '#4a3a2c'));
  }
  const m = new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.castShadow = true;
  g.add(m);
  return g;
}

// A dug hole: dark damp sand in the pit, the spoil heaped to one side in the
// island's own colour.
function holeModel(ground) {
  const g = new THREE.Group();
  const damp = ground.clone().multiplyScalar(0.48);
  const deep = ground.clone().multiplyScalar(0.26);
  const pit = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), new THREE.MeshLambertMaterial({ color: damp }));
  pit.rotation.x = -Math.PI / 2;
  pit.position.y = 0.025;
  pit.receiveShadow = true;
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.32, 10), new THREE.MeshLambertMaterial({ color: deep }));
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.03;
  // Spoil: a low, lumpy mound rather than a neat dome.
  const geo = new THREE.SphereGeometry(0.42, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);
    const n = 1 + 0.18 * Math.sin(x * 9.1 + z * 4.3) * Math.cos(z * 7.7 - x * 2.1);
    pos.setXYZ(i, x * n, y * (0.8 + 0.4 * Math.abs(Math.sin(x * 5 + z * 3))), z * n);
  }
  geo.computeVertexNormals();
  const heap = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: ground.clone().lerp(damp, 0.6), flatShading: true }));
  heap.scale.set(1.05, 0.26, 0.75);
  heap.position.set(0.78, -0.02, 0.1);
  heap.receiveShadow = true;
  g.add(pit, inner, heap);
  return g;
}

// Turned earth over a buried chest: a low, uneven patch a shade darker than
// the ground round it, with a few clods. Easy to walk past if you're not looking.
function turnedEarth(x, z) {
  const rand = mulberry32((Math.round(x * 100) * 73856093) ^ (Math.round(z * 100) * 19349663));
  const base = groundColorAt(x, z);
  const dark = base.clone().multiplyScalar(0.74).lerp(new THREE.Color('#6b5236'), 0.18);
  const rings = [0, 0.38, 0.78, 1.1];
  const seg = 14;
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  for (let r = 0; r < rings.length; r++) {
    const n = r === 0 ? 1 : seg;
    for (let i = 0; i < n; i++) {
      const a = (i / seg) * Math.PI * 2 + r * 0.4;
      const rr = rings[r] * (r === rings.length - 1 ? 0.9 + rand() * 0.25 : 0.85 + rand() * 0.3);
      const px = x + Math.cos(a) * rr;
      const pz = z + Math.sin(a) * rr;
      const lift = [0.07, 0.055, 0.03, 0.006][r] + (r < 3 ? (rand() - 0.5) * 0.04 : 0);
      pos.push(px, groundAt(px, pz) + lift, pz);
      c.copy(dark).lerp(base, [0, 0.15, 0.5, 1][r] + (r < 3 ? rand() * 0.15 : 0));
      col.push(c.r, c.g, c.b);
    }
  }
  const idx = [];
  const at = (r, i) => (r === 0 ? 0 : 1 + (r - 1) * seg + (i % seg));
  for (let i = 0; i < seg; i++) idx.push(0, at(1, i + 1), at(1, i));
  for (let r = 1; r < rings.length - 1; r++) {
    for (let i = 0; i < seg; i++) {
      idx.push(at(r, i), at(r, i + 1), at(r + 1, i + 1));
      idx.push(at(r, i), at(r + 1, i + 1), at(r + 1, i));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const g = new THREE.Group();
  const patch = new THREE.Mesh(geo, mat);
  patch.receiveShadow = true;
  g.add(patch);
  const clodMat = new THREE.MeshLambertMaterial({ color: dark, flatShading: true });
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.3 + rand() * 0.8;
    const clod = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035 + rand() * 0.035, 0), clodMat);
    clod.position.set(x + Math.cos(a) * r, 0, z + Math.sin(a) * r);
    clod.position.y = groundAt(clod.position.x, clod.position.z) + 0.02;
    clod.scale.y = 0.6;
    g.add(clod);
  }
  return g;
}

export function shovelModel() {
  const parts = [
    paint(segment(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.85, 0), 0.02, 0.02, 5), '#8a6a45'),
  ];
  const blade = new THREE.BoxGeometry(0.17, 0.22, 0.02);
  blade.translate(0, -0.95, 0);
  parts.push(paint(blade, '#55595d'));
  const m = new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// Loose things that fall, float and ride on decks.
// ---------------------------------------------------------------------------

export class Loose {
  constructor(object, { half = 0.3, draft = 0.18, kind = 'chest' } = {}) {
    this.object = object;
    this.kind = kind;
    this.half = half;
    this.draft = draft;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.held = false;
    this.platform = null;
    this.resting = false;
    this.rise = null;
    this.ground = null;
    this.tilt = new THREE.Quaternion();
  }

  update(dt, world, t, waveScale) {
    if (this.held || this.pinned) return;
    if (this.rise) {
      // Being worked up out of the hole.
      const r = this.rise;
      r.t = Math.min(1, r.t + dt / 0.9);
      const e = r.t * r.t * (3 - 2 * r.t);
      this.pos.y = r.from + (r.to - r.from) * e;
      if (r.t >= 1) this.rise = null;
      this.object.position.copy(this.pos);
      this.object.rotation.y = -this.yaw;
      return;
    }
    if (this.platform) {
      this.platform.carry(this.pos);
      this.yaw += this.platform.yaw - this.platform.prevYaw;
    }
    const water = heightAt(this.pos.x, this.pos.z, t, waveScale);
    const sub = water - this.draft - this.pos.y;
    if (sub > 0) {
      // Floating: bob at the surface, drift to a stop.
      this.vel.y += sub * 30 * dt - this.vel.y * 4 * dt;
      this.vel.x *= Math.exp(-1.2 * dt);
      this.vel.z *= Math.exp(-1.2 * dt);
      this.platform = null;
    }
    this.vel.y -= 22 * dt;
    // Short steps when falling fast, so it lands on decks instead of through them.
    const steps = Math.min(8, Math.max(1, Math.ceil((this.vel.length() * dt) / 0.2)));
    for (let i = 0; i < steps - 1; i++) {
      this.pos.addScaledVector(this.vel, dt / steps);
      if (world.probeDown(this.pos.x, this.pos.z, this.pos.y + 0.3, 0.3)) break;
    }
    this.pos.addScaledVector(this.vel, dt / steps);
    const c = this.pos.clone().add(new THREE.Vector3(0, this.half, 0));
    const before = c.clone();
    world.resolveSphere(c, this.half * 0.9, { terrain: false });
    // Pushed mostly upward means it's sitting on something: friction holds it
    // there instead of letting it creep down a sloping deck.
    const px = c.x - before.x;
    const pz = c.z - before.z;
    if (c.y - before.y > 0 && Math.hypot(px, pz) < (c.y - before.y) * 1.2) {
      c.x = before.x;
      c.z = before.z;
    }
    this.pos.x = c.x;
    this.pos.z = c.z;
    const hit = world.probeDown(this.pos.x, this.pos.z, this.pos.y + 0.4, 0.6);
    this.resting = false;
    this.ground = null;
    if (hit && this.pos.y <= hit.y + 0.02 && this.vel.y <= 0) {
      this.pos.y = hit.y;
      this.vel.y = 0;
      this.vel.x *= Math.exp(-8 * dt);
      this.vel.z *= Math.exp(-8 * dt);
      this.platform = hit.collider?.body ?? null;
      this.resting = true;
      this.ground = hit.normal;
    }
    // Never through the sand, whatever the step size.
    const floor = groundAt(this.pos.x, this.pos.z);
    if (this.pos.y < floor) {
      this.pos.y = floor;
      if (this.vel.y < 0) this.vel.y = 0;
      this.platform = null;
      this.resting = true;
    }
    this.object.position.copy(this.pos);
    // Sit flush on whatever it's resting on.
    _yaw.setFromAxisAngle(_up, -this.yaw);
    if (this.ground && this.ground.y > 0.6) {
      _tilt.setFromUnitVectors(_up, this.ground);
      this.tilt.slerp(_tilt, 0.25);
    } else {
      this.tilt.slerp(_noTilt, 0.1);
    }
    this.object.quaternion.copy(this.tilt).multiply(_yaw);
  }
}

const _up = new THREE.Vector3(0, 1, 0);
const _yaw = new THREE.Quaternion();
const _tilt = new THREE.Quaternion();
const _noTilt = new THREE.Quaternion();

// ---------------------------------------------------------------------------

export class Treasure {
  constructor({ scene, world, hud, progress }) {
    this.scene = scene;
    this.world = world;
    this.hud = hud;
    this.progress = progress;
    // What the server says you hold.
    this.state = { maps: [], puzzles: [] };
    progress.onChange((s) => {
      const had = this.state.maps.length;
      this.state = { maps: s.maps ?? [], puzzles: s.solved ?? [] };
      if (this.state.maps.length > had) this.mapIndex = this.state.maps.length - 1;
      this.#refreshMap();
    });
    this.loose = [];
    this.crabs = [];
    this.holes = [];
    this.patches = new Map(); // turned earth over chests you've come close to
    this.pending = false;
    this.mapEl = null;
    this.mapIndex = 0;
    this.#buildMapView();
  }

  /** You start with one map. Chests you'd dug up but not got home are waiting on deck. */
  async start(onDeck) {
    const P = this.progress;
    if (!P.online) return;
    if (!P.state.given) {
      const r = await P.act('firstMap').catch(() => null);
      if (r?.ok) this.hud.say('You have a treasure map. Press M to look at it.', 7);
    }
    for (const [id, c] of Object.entries(P.state.chests ?? {})) {
      if (c.delivered) continue;
      const at = onDeck();
      const chest = this.spawnChest(at.x, at.y + 0.3, at.z, { from: c.from, rise: false });
      chest.chestId = id;
    }
  }

  /** The spare map on the chart table. */
  async spareMap() {
    const r = await this.progress.act('spareMap');
    if (!r.ok) throw new Error(r.why);
    return r.map;
  }

  canDig(x, z) {
    return !!diggableAt(x, z);
  }

  /** Ask the server what's in the hole at (x, z). */
  async dig(x, z) {
    const y = groundAt(x, z);
    this.#hole(x, y, z);
    let res;
    try {
      res = await this.progress.act('dig', { x, z });
    } catch {
      return { result: 'nothing' };
    }
    if (!res.ok) return { result: 'nothing' };
    if (res.result === 'chest') {
      this.mapIndex = 0;
      const c = this.spawnChest(x, y, z, { from: res.from });
      c.chestId = res.chest;
      for (const [key, p] of this.patches) {
        if (Math.hypot(p.userData.x - x, p.userData.z - z) < 3) {
          this.scene.remove(p);
          this.patches.delete(key);
        }
      }
      this.hud.say('Chest found.');
    } else if (res.result === 'crab') {
      this.spawnCrab(x, y, z);
    }
    return res;
  }

  #hole(x, y, z) {
    const h = holeModel(groundColorAt(x, z));
    h.position.set(x, y, z);
    h.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(h);
    this.holes.push(h);
    if (this.holes.length > 30) this.scene.remove(this.holes.shift());
  }

  spawnChest(x, y, z, { from = null, rise = true } = {}) {
    const obj = chestModel();
    this.scene.add(obj);
    const c = new Loose(obj, { half: 0.26, draft: 0.2, kind: 'chest' });
    c.pos.set(x, y, z);
    if (rise) {
      c.rise = { t: 0, from: y - 0.6, to: y + 0.02 };
      c.pos.y = y - 0.6;
    }
    c.yaw = Math.random() * Math.PI * 2;
    c.from = from;
    c.delivered = false;
    this.loose.push(c);
    return c;
  }

  /** A chest left somewhere hard to get to (top of a climb). Once per player. */
  placeCourseChest(id, at) {
    if (this.state.puzzles.includes(id)) return null;
    const c = this.spawnChest(at.x, at.y, at.z, { from: id, rise: false });
    c.course = id;
    c.yaw = 0.35;
    return c;
  }

  /** Tell the server we've got the chest off the top. */
  async claim(c) {
    if (c.claimed) return;
    c.claimed = true;
    try {
      const res = await this.progress.act('claim', { course: c.course, x: c.pos.x, y: c.pos.y, z: c.pos.z });
      if (res.result === 'chest') c.chestId = res.chest;
      else c.claimed = false;
    } catch {
      c.claimed = false;
    }
  }

  /** A cask lying about, to be carried somewhere. */
  spawnBarrel(x, y, z, yaw = 0) {
    const obj = barrelModel();
    this.scene.add(obj);
    const b = new Loose(obj, { half: 0.32, draft: 0.3, kind: 'barrel' });
    b.pos.set(x, y, z);
    b.yaw = yaw;
    obj.position.copy(b.pos);
    this.loose.push(b);
    return b;
  }

  spawnCrab(x, y, z) {
    const obj = crabModel();
    obj.position.set(x, y, z);
    this.scene.add(obj);
    // Scuttle off downhill toward the sea.
    const gx = groundAt(x + 1, z) - groundAt(x - 1, z);
    const gz = groundAt(x, z + 1) - groundAt(x, z - 1);
    const l = Math.hypot(gx, gz) || 1;
    this.crabs.push({ obj, dir: new THREE.Vector2(-gx / l, -gz / l), t: 0 });
  }

  /** Something near enough to pick up? */
  nearest(p, r = 1.4) {
    let best = null;
    let bd = r;
    for (const c of this.loose) {
      if (c.held || c.stuck) continue;
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      if (d < bd && Math.abs(c.pos.y - p.y) < 1.6) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  /**
   * Walking about an island you've a map for (or one with a puzzle), ask now
   * and then whether a chest is close. The server only says when it is.
   */
  #watchGround(dt, player) {
    this.nearT = (this.nearT ?? 0) - dt;
    if (!player || this.nearT > 0 || this.nearBusy || player.platform) return;
    const p = player.pos;
    if (this.nearAt && Math.hypot(p.x - this.nearAt.x, p.z - this.nearAt.z) < 4) return;
    const isl = islandNear(p.x, p.z, 15);
    if (!isl || groundAt(p.x, p.z) < -1.2) return;
    const puzzle = { bar: 'pells-bar', horseshoe: 'horseshoe' }[isl.id];
    const wanted = this.state.maps.some((m) => m.island === isl.id) || (puzzle && !this.state.puzzles.includes(puzzle));
    if (!wanted) return;
    this.nearT = 1.5;
    this.nearAt = { x: p.x, z: p.z };
    this.nearBusy = true;
    this.progress
      .act('near', { x: p.x, z: p.z })
      .then((res) => (res.spots ?? []).forEach((s) => this.#markGround(s)))
      .catch(() => {})
      .finally(() => {
        this.nearBusy = false;
      });
  }

  #markGround(s) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) return;
    if (s.puzzle && this.state.puzzles.includes(s.puzzle)) return;
    const key = `${s.x},${s.z}`;
    if (this.patches.has(key)) return;
    const m = turnedEarth(s.x, s.z);
    m.userData.x = s.x;
    m.userData.z = s.z;
    this.scene.add(m);
    this.patches.set(key, m);
  }

  update(dt, { t, waveScale, boatBody, player }) {
    this.#watchGround(dt, player);
    for (const c of this.loose) {
      if (c.held && player) {
        // Held out in front of the bear's tummy.
        const f = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
        c.pos.copy(player.pos).addScaledVector(f, 0.55);
        c.pos.y += player.mode === 'swim' ? 0.75 : 0.42;
        c.yaw = -player.heading;
        c.object.position.copy(c.pos);
        c.object.rotation.set(0, player.heading, 0);
        c.tilt.identity();
        continue;
      }
      c.update(dt, this.world, t, waveScale);
      if (c.kind === 'chest' && !c.delivered && c.resting && boatBody && c.platform === boatBody) this.#deliver(c);
      if (c.opening !== undefined && c.opening < 1) {
        c.opening = Math.min(1, c.opening + dt * 1.5);
        c.object.userData.lid.rotation.x = -1.9 * (c.opening * c.opening * (3 - 2 * c.opening));
      }
    }
    for (let i = this.crabs.length - 1; i >= 0; i--) {
      const k = this.crabs[i];
      k.t += dt;
      const o = k.obj;
      const speed = k.t < 0.6 ? 0 : 1.6;
      o.position.x += k.dir.x * speed * dt;
      o.position.z += k.dir.y * speed * dt;
      o.position.y = Math.max(groundAt(o.position.x, o.position.z), heightAt(o.position.x, o.position.z, t, waveScale) - 0.25);
      o.rotation.y = Math.atan2(k.dir.x, k.dir.y) + Math.PI / 2 + Math.sin(k.t * 30) * 0.08;
      if (k.t > 0.6 && o.position.y < heightAt(o.position.x, o.position.z, t, waveScale) - 0.2) o.position.y -= dt * 0.5;
      if (k.t > 7) {
        this.scene.remove(o);
        this.crabs.splice(i, 1);
      }
    }
  }

  async #deliver(c) {
    c.delivered = true;
    c.opening = 0;
    if (!c.chestId) {
      this.hud.say('Empty.');
      return;
    }
    try {
      const r = await this.progress.act('deliver', { chest: c.chestId });
      if (!r.ok) this.hud.say('Empty.');
      else if (r.kind) this.hud.say(`${cap(countOf(r.kind, 1))}, and a map.`, 4);
      else this.hud.say("There's a map inside.");
    } catch {
      this.hud.say('Empty.');
    }
  }

  // -------------------------------------------------------------------
  // The map you hold up (M). Arrow keys flip between maps.
  // -------------------------------------------------------------------

  #buildMapView() {
    const el = document.createElement('div');
    el.className = 'map-view';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    this.mapEl = el;
  }

  get mapOpen() {
    return this.mapEl.classList.contains('open');
  }

  async toggleMap() {
    if (this.mapOpen) {
      this.mapEl.classList.remove('open');
      return;
    }
    if (!this.state.maps.length) {
      this.hud.say("No maps. There's one on the chart table below decks.", 4);
      return;
    }
    await document.fonts?.load?.('26px "Reenie Beanie"').catch(() => {});
    this.mapEl.classList.add('open');
    this.#refreshMap();
  }

  flip(d) {
    if (!this.mapOpen || this.state.maps.length < 2) return;
    this.mapIndex = (this.mapIndex + d + this.state.maps.length) % this.state.maps.length;
    this.#refreshMap();
  }

  #refreshMap() {
    if (!this.mapEl) return;
    const maps = this.state.maps;
    this.mapEl.innerHTML = '';
    if (!maps.length) {
      this.mapEl.classList.remove('open');
      return;
    }
    this.mapIndex = Math.min(this.mapIndex, maps.length - 1);
    this.mapEl.appendChild(drawMap(maps[this.mapIndex]));
    if (maps.length > 1) {
      const n = document.createElement('div');
      n.className = 'map-count';
      n.textContent = `${this.mapIndex + 1} of ${maps.length}`;
      this.mapEl.appendChild(n);
    }
  }
}

export { chestModel };
