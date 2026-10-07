import * as THREE from 'three';
import { heightAt } from '../shared/waves.js';
import { diggableAt, groundAt } from '../shared/world.js';
import { paint, mergeParts, segment } from './props.js';
import { drawMap } from './mapview.js';
import { groundColorAt } from './terrain.js';

// Treasure on the client: maps you carry, digging, holes, chests and crabs.
// Where treasure is and whether a hole has it is the server's call; this
// side only draws and carries things.

const STORE = 'hots.v1';

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

function crabModel() {
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
  constructor({ scene, world, hud, api = '' }) {
    this.scene = scene;
    this.world = world;
    this.hud = hud;
    this.api = api;
    this.state = this.#load();
    this.loose = [];
    this.crabs = [];
    this.holes = [];
    this.pending = false;
    this.mapEl = null;
    this.mapIndex = 0;
    this.#buildMapView();
  }

  #load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) ?? 'null');
      if (s && Array.isArray(s.maps)) return s;
    } catch {
      // ignore
    }
    return { maps: [], given: false, puzzles: [], delivered: 0 };
  }

  save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.state));
    } catch {
      // private mode etc.
    }
  }

  async #post(path, body) {
    const res = await fetch(`${this.api}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return res.json();
  }

  /** You start with one map. */
  async start() {
    if (this.state.given || this.state.maps.length) return;
    try {
      const map = await this.#post('/api/maps', {});
      this.state.maps.push(map);
      this.state.given = true;
      this.save();
      this.#refreshMap();
      this.hud.say('You have a treasure map. Press M to look at it.', 7);
    } catch {
      // No server (e.g. plain vite): no maps this session.
    }
  }

  async newMap(not = []) {
    const map = await this.#post('/api/maps', { not });
    this.state.maps.push(map);
    this.save();
    this.mapIndex = this.state.maps.length - 1;
    this.#refreshMap();
    return map;
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
      res = await this.#post('/api/dig', { x, z, maps: this.state.maps.map((m) => m.id) });
    } catch {
      return { result: 'nothing' };
    }
    if (res.result === 'chest') {
      if (res.map) {
        const m = this.state.maps.find((mm) => mm.id === res.map);
        this.state.maps = this.state.maps.filter((mm) => mm.id !== res.map);
        this.mapIndex = 0;
        this.#refreshMap();
        this.spawnChest(x, y, z, { from: m?.island });
      } else if (res.puzzle) {
        if (this.state.puzzles.includes(res.puzzle)) return { result: 'nothing' };
        this.state.puzzles.push(res.puzzle);
        this.spawnChest(x, y, z, { from: res.puzzle });
      }
      this.save();
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
      const res = await this.#post('/api/claim', { course: c.course, x: c.pos.x, y: c.pos.y, z: c.pos.z });
      if (res.result === 'chest' && !this.state.puzzles.includes(c.course)) {
        this.state.puzzles.push(c.course);
        this.save();
      }
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

  update(dt, { t, waveScale, boatBody, player }) {
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
    this.state.delivered++;
    this.save();
    try {
      await this.newMap(c.from ? [c.from] : []);
      this.hud.say("There's a map inside.");
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
