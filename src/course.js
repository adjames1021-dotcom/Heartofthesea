import * as THREE from 'three';
import { heightAt } from '../shared/waves.js';
import { groundAt } from '../shared/world.js';
import { WRECK, stationU, halfBreadth, deckHeight } from '../shared/wreck.js';
import { Body, makeBox } from './collision.js';
import { paint, mergeParts, segment, rock } from './props.js';

// The climb on the Molly Ann wreck. Nothing here is marked or lit: the way up
// is whatever a sailor would use.
//
//   1. From a flat coral head at the edge of the pool, across debris tethered
//      in the pool. The swell lifts and drops it. One hatch cover is on a short
//      line and gets dragged under at the top of a swell.
//   2. From the broken spar alongside the hull, at the top of a swell, catch
//      the main channel (the plank the shrouds were spread on). Up onto it,
//      then over the rail onto the deck.
//   3. Run along the deck and jump for the rope hanging off the fore yard;
//      swing across the gap and let go over the bow.
//   4. Up the starboard fore ratlines onto the fore top.
//
// The hull is solid, the bow can't be reached from the water, and anything
// you fall off drops you in the sea or onto the reef.

const WOOD = '#5a4a39';
const WOOD_DARK = '#43372b';
const WOOD_PALE = '#8a7558';
const ROPE = '#7d6a4d';
const IRON = '#37322d';
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Floating debris in the pool (world coordinates). `free` is how far the top
// sits above the water; `tether` caps how high it can rise.
const FLOATS = [
  { kind: 'hatch', x: 240.2, z: -436.0, yaw: 0.4, half: [0.9, 0.08, 0.75], free: 0.07 },
  { kind: 'raft', x: 237.5, z: -434.7, yaw: 1.1, half: [0.8, 0.25, 0.75], free: 0.18 },
  { kind: 'hatch', x: 234.4, z: -433.4, yaw: -0.3, half: [0.85, 0.08, 0.8], free: 0.06, tether: 0.15 },
  { kind: 'spar', x: 231.85, z: -433.2, yaw: -2.983, half: [0.3, 0.22, 1.7], free: 0.17 },
];
const LAUNCH = { x: 242.6, z: -437.6, r: 0.85, top: 0.15 };

export class WreckCourse {
  constructor({ scene, world, wreck }) {
    this.world = world;
    world.climbables ??= [];
    world.ropes ??= [];
    this.group = new THREE.Group();
    this.group.name = 'course:wreck';
    scene.add(this.group);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

    wreck.updateMatrixWorld(true);
    const { stern, bow } = wreck.userData;
    // The stern half: solid hull, bulwarks, hatch, mainmast stump, channel.
    // Its broken forward end can't be caught from the reef below.
    this.#hull(stern, -13.5, -0.81, (i, n) => (i === n - 1 ? { noGrab: true } : {}));
    this.#sternFittings(stern);
    // The bow half: you only get onto it by the rope.
    this.#hull(bow, 3.78, 13.5, () => ({ noGrab: true, noClimb: true }));
    this.#bowFittings(bow, wreck.userData);

    this.#launchRock();
    this.floats = FLOATS.map((f) => this.#float(f));
    this.rope = this.#rope(wreck.userData.ropeAnchorLocal.clone().applyMatrix4(bow.matrixWorld));
  }

  // -------------------------------------------------------------------
  // Colliders hung off the wreck's own transforms
  // -------------------------------------------------------------------

  #box(obj, cx, cy, cz, hx, hy, hz, flags = {}) {
    const m = new THREE.Matrix4().compose(V(cx, cy, cz), new THREE.Quaternion(), ONE).premultiply(obj.matrixWorld);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    m.decompose(p, q, new THREE.Vector3());
    return this.world.addStatic(makeBox({ center: p, half: V(hx, hy, hz), quaternion: q, ...flags }));
  }

  #capsule(obj, a, b, r, flags = {}) {
    return this.world.addStatic({ type: 'capsule', a: a.clone().applyMatrix4(obj.matrixWorld), b: b.clone().applyMatrix4(obj.matrixWorld), r, ...flags });
  }

  /** Solid hull in short lengths, each with a bulwark either side. */
  #hull(obj, x0, x1, flagsFor) {
    const n = Math.ceil((x1 - x0) / 1.3);
    for (let i = 0; i < n; i++) {
      const xa = x0 + ((x1 - x0) * i) / n;
      const xb = x0 + ((x1 - x0) * (i + 1)) / n;
      const xm = (xa + xb) / 2;
      const u = stationU(xm);
      const top = deckHeight(u);
      const hb = halfBreadth(u);
      if (hb < 0.4) continue;
      const f = flagsFor(i, n);
      this.#box(obj, xm, (top - 2.2) / 2, 0, (xb - xa) / 2 + 0.03, (top + 2.2) / 2, hb - 0.2, f);
      for (const side of [-1, 1]) this.#box(obj, xm, top + 0.4, side * (hb - 0.1), (xb - xa) / 2 + 0.03, 0.4, 0.1, f);
    }
  }

  #sternFittings(stern) {
    const { mainmast, channel, hatch } = WRECK;
    const dy = (x) => deckHeight(stationU(x));
    this.#box(stern, hatch.x, dy(hatch.x) + 0.12, 0, hatch.w / 2, 0.175, hatch.d / 2);
    this.#capsule(stern, V(mainmast.x, dy(mainmast.x), 0), V(mainmast.x, mainmast.top, 0), mainmast.r);
    const cx = (channel.x0 + channel.x1) / 2;
    this.#box(stern, cx, channel.y, halfBreadth(stationU(cx)) + channel.width / 2 - 0.05, (channel.x1 - channel.x0) / 2, 0.07, channel.width / 2);
  }

  #bowFittings(bow, data) {
    const fm = WRECK.foremast;
    const dy = (x) => deckHeight(stationU(x));
    this.#capsule(bow, V(fm.x, dy(fm.x), 0), V(fm.x, fm.top, 0), fm.r, { noGrab: true });
    // The fore top: a small square platform. You can catch its edge.
    this.#box(bow, fm.x, fm.foreTop, 0, 1.3, 0.11, 1.3, { noClimb: true });
    for (const [dx, dz] of [[1.2, 1.2], [1.2, -1.2], [-1.2, 1.2], [-1.2, -1.2]]) {
      this.#capsule(bow, V(fm.x + dx, fm.foreTop, dz), V(fm.x + dx, fm.foreTop + 0.6, dz), 0.06, { noGrab: true });
    }
    // The fore yard, slipped and hanging askew over the gap.
    const pivot = V(fm.x, 10, 0);
    const dir = V(-Math.sin(1.22), -0.17, Math.cos(1.22)).normalize();
    this.#capsule(bow, pivot.clone().addScaledVector(dir, -6.0), pivot.clone().addScaledVector(dir, 6.8), 0.16, { noGrab: true });

    // Starboard fore ratlines: a rope ladder from the rail to the top.
    const { lo, hi, lo2, hi2 } = data.ratlines;
    const w = (v) => v.clone().applyMatrix4(bow.matrixWorld);
    const loW = w(lo);
    const lo2W = w(lo2);
    const loMid = loW.clone().lerp(lo2W, 0.5);
    const hiMid = w(hi).lerp(w(hi2), 0.5);
    const u = hiMid.clone().sub(loMid);
    const h = u.length();
    u.normalize();
    const r = lo2W.clone().sub(loW);
    r.addScaledVector(u, -r.dot(u)).normalize();
    const n = new THREE.Vector3().crossVectors(r, u).normalize();
    const width = 1.3;
    const reachDown = 0.8; // catch it from the rail
    this.world.climbables.push({
      o: loMid.clone().addScaledVector(r, -width / 2).addScaledVector(u, -reachDown),
      r,
      u,
      n,
      w: width,
      h: h + reachDown,
      exit: w(V(fm.x - 0.2, fm.foreTop + 0.11, 0.5)),
    });
  }

  // -------------------------------------------------------------------
  // The coral head you start from
  // -------------------------------------------------------------------

  #launchRock() {
    const L = LAUNCH;
    // Old coral: dull ochre, darker where the sea keeps it wet.
    const g = rock(1.05, 4401, '#8c7a5e', 0.55);
    g.translate(L.x, L.top - 0.55, L.z);
    const base = rock(1.3, 4402, '#6e604b', 0.9);
    base.translate(L.x + 0.2, -1.4, L.z - 0.1);
    const m = new THREE.Mesh(mergeParts([g, base]), this.mat);
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    this.world.addStatic({ type: 'cyl', x: L.x, z: L.z, r: L.r, y0: -3, y1: L.top });
  }

  // -------------------------------------------------------------------
  // Floating debris
  // -------------------------------------------------------------------

  #float(f) {
    const [hx, hy, hz] = f.half;
    const body = this.world.addBody(new Body([{ center: V(0, 0, 0), half: V(hx, hy, hz) }], `float:${f.kind}`));
    body.awash = true; // dragged under, it washes you off
    const mesh = new THREE.Mesh(floatGeometry(f), this.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    // A line down to a stone on the bottom.
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 4, 1), new THREE.MeshLambertMaterial({ color: ROPE }));
    line.matrixAutoUpdate = false;
    this.group.add(line);
    const stone = new THREE.Mesh(rock(0.35, 4500 + Math.round(f.x), '#6f675c', 0.7), this.mat);
    const bottom = groundAt(f.x + 0.4, f.z - 0.3);
    stone.position.set(f.x + 0.4, bottom + 0.1, f.z - 0.3);
    this.group.add(stone);
    return { ...f, body, mesh, line, anchor: V(f.x + 0.4, bottom + 0.25, f.z - 0.3), y: null, tiltX: 0, tiltZ: 0, t: null, matrix: new THREE.Matrix4() };
  }

  // -------------------------------------------------------------------
  // The rope off the fore yard
  // -------------------------------------------------------------------

  #rope(anchor) {
    const rope = { anchor, length: 6.0, p: V(0, -6.0, 0), v: V(0, 0, 0), held: false };
    this.world.ropes.push(rope);
    const mat = new THREE.MeshLambertMaterial({ color: ROPE });
    rope.mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 5, 1), mat);
    rope.mesh.matrixAutoUpdate = false;
    rope.mesh.castShadow = true;
    // The frayed end and a knot to hold.
    rope.knot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), mat);
    this.group.add(rope.mesh, rope.knot);
    return rope;
  }

  // -------------------------------------------------------------------

  update(t, dt, waveScale) {
    for (const f of this.floats) this.#updateFloat(f, t, waveScale);
    const rope = this.rope;
    if (!rope.held) {
      // A loose rope swings itself to a stop.
      const pn = rope.p.clone().normalize();
      rope.v.y -= 22 * dt;
      rope.v.addScaledVector(pn, -rope.v.dot(pn));
      rope.v.multiplyScalar(Math.exp(-0.9 * dt));
      rope.p.addScaledVector(rope.v, dt).setLength(rope.length);
    }
    lineBetween(rope.mesh, rope.anchor, rope.anchor.clone().add(rope.p));
    rope.knot.position.copy(rope.anchor).addScaledVector(rope.p, 0.97);
  }

  #updateFloat(f, t, waveScale) {
    // Follow the water on world time, so slow frames can't leave it behind.
    const dw = f.t === null ? 1 : Math.min(Math.max(t - f.t, 0), 1);
    f.t = t;
    const k = 1 - Math.exp(-dw * 6);
    const water = heightAt(f.x, f.z, t, waveScale);
    let top = water + f.free;
    const held = f.tether !== undefined && top > f.tether;
    if (held) top = f.tether;
    const y = top - f.half[1];
    f.y = f.y === null ? y : f.y + (y - f.y) * k;
    // Tilt with the slope of the water, unless the line has it held under.
    const s = 0.9;
    const sx = (heightAt(f.x + s, f.z, t, waveScale) - heightAt(f.x - s, f.z, t, waveScale)) / (2 * s);
    const sz = (heightAt(f.x, f.z + s, t, waveScale) - heightAt(f.x, f.z - s, t, waveScale)) / (2 * s);
    // A narrow spar barely rolls (or nobody could stand on it).
    const k2 = f.kind === 'spar' ? 0.15 : 0.45;
    const tx = held ? 0 : -Math.atan(sz) * k2;
    const tz = held ? 0 : Math.atan(sx) * k2;
    f.tiltX += (tx - f.tiltX) * k;
    f.tiltZ += (tz - f.tiltZ) * k;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(f.tiltX, 0, f.tiltZ, 'XYZ'));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, f.yaw));
    f.matrix.compose(V(f.x, f.y, f.z), q, ONE);
    f.body.setMatrix(f.matrix);
    f.mesh.matrix.copy(f.matrix);
    lineBetween(f.line, V(f.x, f.y - f.half[1], f.z), f.anchor);
  }
}

/** Stretch a unit-height cylinder between two points. */
function lineBetween(mesh, a, b) {
  const d = b.clone().sub(a);
  const len = d.length() || 1e-3;
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.divideScalar(len));
  mesh.matrix.compose(a.clone().lerp(b, 0.5), q, V(1, len, 1));
}

// ---------------------------------------------------------------------------
// What the floats look like. Each sits centred on its collision box.
// ---------------------------------------------------------------------------

function floatGeometry(f) {
  const [hx, hy, hz] = f.half;
  const parts = [];
  const box = (x, y, z, sx, sy, sz, color) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, z);
    parts.push(paint(g, color));
  };
  if (f.kind === 'hatch') {
    // A grating hatch cover: a frame round crossed slats.
    box(0, 0, -hz + 0.06, hx * 2, hy * 2, 0.12, WOOD_DARK);
    box(0, 0, hz - 0.06, hx * 2, hy * 2, 0.12, WOOD_DARK);
    box(-hx + 0.06, 0, 0, 0.12, hy * 2, hz * 2 - 0.24, WOOD_DARK);
    box(hx - 0.06, 0, 0, 0.12, hy * 2, hz * 2 - 0.24, WOOD_DARK);
    for (let i = 0; i < 6; i++) {
      const x = -hx + 0.2 + (i * (hx * 2 - 0.4)) / 5;
      box(x, 0.01, 0, 0.09, hy * 1.8, hz * 2 - 0.2, WOOD_PALE);
    }
    for (let i = 0; i < 3; i++) box(0, -0.02, -hz + 0.35 + i * (hz - 0.35), hx * 2 - 0.2, hy * 1.4, 0.07, WOOD);
  } else if (f.kind === 'raft') {
    // Three casks lashed under a couple of planks.
    for (let i = 0; i < 3; i++) {
      const z = -hz + 0.22 + i * (hz - 0.22);
      const c = new THREE.CylinderGeometry(0.21, 0.21, hx * 2 - 0.05, 9);
      c.rotateZ(Math.PI / 2);
      c.translate(0, -0.06, z);
      parts.push(paint(c, '#6b5440'));
      for (const bx of [-hx * 0.55, hx * 0.55]) {
        const band = new THREE.CylinderGeometry(0.225, 0.225, 0.05, 9);
        band.rotateZ(Math.PI / 2);
        band.translate(bx, -0.06, z);
        parts.push(paint(band, IRON));
      }
    }
    box(-hx * 0.45, hy - 0.04, 0, 0.32, 0.07, hz * 2, WOOD_PALE);
    box(hx * 0.45, hy - 0.04, 0, 0.3, 0.07, hz * 2 - 0.1, WOOD);
    for (const x of [-hx * 0.45, hx * 0.45]) {
      for (const z of [-hz * 0.6, hz * 0.6]) parts.push(paint(segment(V(x - 0.2, hy - 0.02, z), V(x + 0.2, hy - 0.02, z), 0.025, 0.025, 4), ROPE));
    }
  } else {
    // A length of broken spar, splintered at one end.
    const c = new THREE.CylinderGeometry(hx * 0.95, hx, hz * 2, 8);
    c.rotateX(Math.PI / 2);
    parts.push(paint(c, WOOD));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const s = V(Math.cos(a) * hx * 0.5, Math.sin(a) * hx * 0.5, hz);
      parts.push(paint(segment(s, s.clone().add(V(Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.25 + (i % 2) * 0.2)), 0.07, 0.015, 4), WOOD));
    }
    for (const z of [-hz * 0.5, hz * 0.3]) {
      const wrap = new THREE.CylinderGeometry(hx + 0.02, hx + 0.02, 0.12, 8);
      wrap.rotateX(Math.PI / 2);
      wrap.translate(0, 0, z);
      parts.push(paint(wrap, ROPE));
    }
  }
  return mergeParts(parts);
}
