import * as THREE from 'three';
import { groundAt } from '../shared/world.js';

// A small collision world for the player (and floating props): island
// terrain, static shapes (vertical cylinders, capsules, oriented boxes) and
// moving bodies made of boxes (the boat, the wreck's floating debris).
//
// Collider flags used elsewhere:
//   grab: top edges can be grabbed (ledges)     noClimb: can't climb out of the water onto it
//   rail: low wall (lifelines)                  surf: a swell can wash you off it

const CELL = 16;
const _v = new THREE.Vector3();
const _l = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _m3 = new THREE.Matrix3();

export function makeBox({ center, half, yaw = 0, pitch = 0, roll = 0, quaternion = null, ...flags }) {
  const local = new THREE.Matrix4();
  const q = quaternion ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, -yaw, pitch, 'YXZ'));
  local.compose(center.clone(), q, _s);
  return {
    type: 'box',
    half: half.clone(),
    local,
    matrix: local.clone(),
    inverse: local.clone().invert(),
    rot: new THREE.Matrix3().setFromMatrix4(local),
    ...flags,
  };
}

/** A set of boxes that move together. Call setMatrix() every frame. */
export class Body {
  constructor(boxes, name = 'body') {
    this.name = name;
    this.boxes = boxes.map((b) => ({ ...makeBox(b), body: this }));
    this.matrix = new THREE.Matrix4();
    this.prevMatrix = new THREE.Matrix4();
    this.inverse = new THREE.Matrix4();
    this.prevInverse = new THREE.Matrix4();
    this.yaw = 0;
    this.prevYaw = 0;
    this.bounds = { x: 0, z: 0, r: 0 };
  }

  setMatrix(m, prev = null) {
    // The very first transform is also the "previous" one: nothing has moved yet.
    this.prevMatrix.copy(this.ready ? prev ?? this.matrix : m);
    this.ready = true;
    this.prevInverse.copy(this.prevMatrix).invert();
    this.matrix.copy(m);
    this.inverse.copy(m).invert();
    const e = new THREE.Vector3(1, 0, 0).applyMatrix3(_m3.setFromMatrix4(m));
    const yaw = Math.atan2(e.z, e.x);
    this.prevYaw = this.ready2 ? this.yaw : yaw;
    this.ready2 = true;
    this.yaw = yaw;
    let r = 0;
    for (const b of this.boxes) {
      b.matrix.multiplyMatrices(m, b.local);
      b.inverse.copy(b.matrix).invert();
      b.rot.setFromMatrix4(b.matrix);
      r = Math.max(r, b.local.elements[12] ** 2 + b.local.elements[14] ** 2);
    }
    this.bounds.x = m.elements[12];
    this.bounds.z = m.elements[14];
    this.bounds.r = Math.sqrt(r) + 3;
  }

  /** Carry a world point along with the body's last move. */
  carry(p) {
    return p.applyMatrix4(this.prevInverse).applyMatrix4(this.matrix);
  }
}

export class CollisionWorld {
  constructor() {
    this.cells = new Map();
    this.bodies = [];
    this.statics = [];
    this.stamp = 0;
  }

  #key(i, j) {
    return i * 73856093 + j * 19349663;
  }

  addStatic(c) {
    if (c.type === 'box' && !c.matrix) c = makeBox(c);
    this.statics.push(c);
    let x0;
    let x1;
    let z0;
    let z1;
    if (c.type === 'cyl') {
      x0 = c.x - c.r;
      x1 = c.x + c.r;
      z0 = c.z - c.r;
      z1 = c.z + c.r;
    } else if (c.type === 'capsule') {
      x0 = Math.min(c.a.x, c.b.x) - c.r;
      x1 = Math.max(c.a.x, c.b.x) + c.r;
      z0 = Math.min(c.a.z, c.b.z) - c.r;
      z1 = Math.max(c.a.z, c.b.z) + c.r;
    } else {
      const ext = c.half.length();
      const cx = c.matrix.elements[12];
      const cz = c.matrix.elements[14];
      x0 = cx - ext;
      x1 = cx + ext;
      z0 = cz - ext;
      z1 = cz + ext;
    }
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = this.#key(i, j);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(c);
      }
    }
    return c;
  }

  addBody(body) {
    this.bodies.push(body);
    return body;
  }

  removeBody(body) {
    this.bodies = this.bodies.filter((b) => b !== body);
  }

  /** Colliders whose bounds may overlap a circle at (x, z). */
  nearby(x, z, r, out = []) {
    out.length = 0;
    this.stamp++;
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const list = this.cells.get(this.#key(i, j));
        if (!list) continue;
        for (const c of list) {
          if (c._stamp === this.stamp) continue;
          c._stamp = this.stamp;
          out.push(c);
        }
      }
    }
    for (const b of this.bodies) {
      if (Math.hypot(x - b.bounds.x, z - b.bounds.z) > b.bounds.r + r) continue;
      for (const box of b.boxes) out.push(box);
    }
    return out;
  }

  /**
   * Push a sphere out of everything. Returns the deepest upward-facing
   * contact (for "standing on" checks): { normal, collider } or null.
   */
  resolveSphere(c, r, { terrain = true, skip = null } = {}) {
    let ground = null;
    let groundNy = 0;
    const list = this.nearby(c.x, c.z, r + 1, _list);
    for (let iter = 0; iter < 2; iter++) {
      for (const col of list) {
        if (skip && skip(col)) continue;
        const hit = sphereVs(col, c, r);
        if (!hit) continue;
        if (col.rail && hit.normal.y > 0.3) {
          // Nobody balances on a lifeline: tip off to whichever side you're on.
          _l.copy(c).applyMatrix4(col.inverse);
          hit.normal.set(0, 0, Math.sign(_l.z) || 1).applyMatrix3(col.rot).normalize();
          hit.depth = Math.min(hit.depth, 0.06);
        }
        c.addScaledVector(hit.normal, hit.depth);
        if (hit.normal.y > 0.55 && hit.normal.y >= groundNy && !col.rail) {
          groundNy = hit.normal.y;
          ground = { normal: hit.normal.clone(), collider: col };
        }
      }
    }
    if (terrain) {
      const h = groundAt(c.x, c.z, _n);
      const pen = h - (c.y - r);
      if (pen > 0) {
        if (_n.y > 0.62) {
          c.y += pen;
          if (_n.y >= groundNy) ground = { normal: _n.clone(), collider: null };
        } else {
          // Too steep to stand on: slide off it.
          c.addScaledVector(_n, pen * _n.y + 0.002);
        }
      }
    }
    return ground;
  }

  /** Is a small sphere at p touching any collider (not terrain)? */
  blocked(p, r = 0.25) {
    const list = this.nearby(p.x, p.z, r + 1, _list2);
    for (const col of list) {
      if (col.rail) continue;
      if (sphereVs(col, p, r)) return true;
    }
    return false;
  }

  /**
   * Highest surface under (x, z) between yTop and yTop − maxDrop.
   * Returns { y, normal, collider } or null. Includes the terrain.
   */
  probeDown(x, z, yTop, maxDrop = 2, { skip = null } = {}) {
    let best = null;
    const tn = new THREE.Vector3();
    const th = groundAt(x, z, tn);
    if (th <= yTop && th >= yTop - maxDrop) best = { y: th, normal: tn, collider: null };
    const list = this.nearby(x, z, 0.5, _list2);
    for (const col of list) {
      if (col.rail || (skip && skip(col))) continue;
      let y = null;
      let normal = null;
      if (col.type === 'cyl') {
        if (Math.hypot(x - col.x, z - col.z) <= col.r && col.y1 <= yTop) {
          y = col.y1;
          normal = new THREE.Vector3(0, 1, 0);
        }
      } else if (col.type === 'box') {
        const hit = rayDownBox(col, x, yTop, z);
        if (hit) {
          y = hit.y;
          normal = hit.normal;
        }
      }
      if (y === null || y < yTop - maxDrop || y > yTop) continue;
      if (!best || y > best.y) best = { y, normal, collider: col };
    }
    return best;
  }
}

const _list = [];
const _list2 = [];

function sphereVs(col, c, r) {
  if (col.type === 'cyl') {
    const dx = c.x - col.x;
    const dz = c.z - col.z;
    const d = Math.hypot(dx, dz);
    const cy = Math.min(Math.max(c.y, col.y0), col.y1);
    const inside = d < col.r;
    if (inside && c.y > col.y0 && c.y < col.y1) {
      // Centre inside: shortest way out.
      const side = col.r - d;
      const up = col.y1 - c.y;
      const down = c.y - col.y0;
      if (up <= side && up <= down) return { normal: new THREE.Vector3(0, 1, 0), depth: up + r };
      if (down < side) return { normal: new THREE.Vector3(0, -1, 0), depth: down + r };
      const n = d > 1e-6 ? new THREE.Vector3(dx / d, 0, dz / d) : new THREE.Vector3(1, 0, 0);
      return { normal: n, depth: side + r };
    }
    const k = inside ? 1 : col.r / d;
    const px = col.x + dx * k;
    const pz = col.z + dz * k;
    _d.set(c.x - px, c.y - cy, c.z - pz);
    const dist = _d.length();
    if (dist >= r || dist < 1e-6) return null;
    return { normal: _d.clone().divideScalar(dist), depth: r - dist };
  }
  if (col.type === 'capsule') {
    const ab = _v.subVectors(col.b, col.a);
    const t = Math.min(1, Math.max(0, _d.subVectors(c, col.a).dot(ab) / ab.lengthSq()));
    const p = _l.copy(col.a).addScaledVector(ab, t);
    _d.subVectors(c, p);
    const dist = _d.length();
    if (dist >= r + col.r || dist < 1e-6) return null;
    return { normal: _d.clone().divideScalar(dist), depth: r + col.r - dist };
  }
  // Oriented box.
  _l.copy(c).applyMatrix4(col.inverse);
  const h = col.half;
  const px = Math.min(Math.max(_l.x, -h.x), h.x);
  const py = Math.min(Math.max(_l.y, -h.y), h.y);
  const pz = Math.min(Math.max(_l.z, -h.z), h.z);
  _d.set(_l.x - px, _l.y - py, _l.z - pz);
  const dist = _d.length();
  if (dist > 1e-6) {
    if (dist >= r) return null;
    const n = _d.divideScalar(dist).applyMatrix3(col.rot).normalize().clone();
    return { normal: n, depth: r - dist };
  }
  // Centre inside the box: leave by the nearest face.
  const ex = h.x - Math.abs(_l.x);
  const ey = h.y - Math.abs(_l.y);
  const ez = h.z - Math.abs(_l.z);
  const n = new THREE.Vector3();
  let depth;
  if (ey <= ex && ey <= ez) {
    n.set(0, Math.sign(_l.y) || 1, 0);
    depth = ey;
  } else if (ex <= ez) {
    n.set(Math.sign(_l.x) || 1, 0, 0);
    depth = ex;
  } else {
    n.set(0, 0, Math.sign(_l.z) || 1);
    depth = ez;
  }
  n.applyMatrix3(col.rot).normalize();
  return { normal: n, depth: depth + r };
}

/** Vertical ray from (x, y, z) downward against an oriented box. */
function rayDownBox(col, x, y, z) {
  const o = _l.set(x, y, z).applyMatrix4(col.inverse);
  const d = _d.set(0, -1, 0).applyMatrix3(_m3.copy(col.rot).transpose());
  let t0 = -Infinity;
  let t1 = Infinity;
  let axis = -1;
  let sign = 1;
  const h = col.half;
  const comps = ['x', 'y', 'z'];
  for (let i = 0; i < 3; i++) {
    const a = comps[i];
    const ext = h[a];
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < -ext || o[a] > ext) return null;
      continue;
    }
    let ta = (-ext - o[a]) / d[a];
    let tb = (ext - o[a]) / d[a];
    let s = -1;
    if (ta > tb) {
      [ta, tb] = [tb, ta];
      s = 1;
    }
    if (ta > t0) {
      t0 = ta;
      axis = i;
      sign = s;
    }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  if (t0 < 0 || axis < 0) return null;
  const n = new THREE.Vector3();
  n.setComponent(axis, sign);
  n.applyMatrix3(col.rot).normalize();
  if (n.y < 0.5) return null;
  return { y: y - t0, normal: n };
}
