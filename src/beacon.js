import * as THREE from 'three';
import { makeBox } from './collision.js';
import { paint, mergeParts, segment, rock } from './props.js';
import { deepenShadows } from './atmosphere.js';
import { groundAt, ISLAND_BY_ID, toWorld } from '../shared/world.js';
import { hash2 } from '../shared/noise.js';
import { TOWER, towerStep, stepStands, floorGap, towerFrame, stonesFromTower, lampAngle, LAMP_STEPS } from '../shared/beacon.js';

// The watch tower on Beacon Island, and the standing stones in the hollow
// below it. Someone kept a signal lamp up here once, to bring the boats in;
// the lamp floor's half fallen in now, and the stair with it.
//
// In through the door at the foot, up the stair round the newel (two places
// where steps have dropped out: jump them), and where it stops, a rope hangs
// from what's left of a floor joist: jump for it and climb. On the lamp
// floor, the lamp on its iron post: pull the chain to light it, work the
// capstan bars to turn it. Turned on the three stones, its light falls in
// the hollow among them, and that's where to dig (the chest's a dig, like
// Pell's Bar: the server knows the spot, shared/beacon.js).
//
// The numbers are in shared/beacon.js.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const STONE = ['#86807a', '#817b73', '#8b857c', '#7e7870', '#847e75'];
const STONE_DARK = '#615d56';
const FLAG = ['#7a766e', '#6f6b63', '#827d74'];
const IRON = '#2f2c29';
const WOOD = '#5d4a38';
const ROPE = '#7d6a4d';
const NOTE = ['LIGHT THE BEACON', 'AND TURN IT TILL', 'IT FINDS THE STONES.', 'DIG WHERE IT FALLS.'];

const polar = (r, a, y) => V(Math.cos(a) * r, y, Math.sin(a) * r);
const pick = (list, i, j) => list[Math.floor(hash2(i, j, 4711) * list.length) % list.length];

/** Triangles for a quad (a b c d round its edge), coloured. */
function quads(list) {
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  for (const [a, b, cc, d, color] of list) {
    c.set(color);
    for (const p of [a, b, cc, a, cc, d]) {
      pos.push(p.x, p.y, p.z);
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/**
 * A block of an annulus: r0…r1 out from the middle, a0…a1 round, y0…y1 up,
 * in n pieces round. Faces coloured by `color(i, j)` (piece i, course j of
 * height `course`), so stonework shows its blocks.
 */
function arcBlock({ r0, r1, a0, a1, y0, y1, n = 8, course = 0, color, ends = true }) {
  const q = [];
  const rows = course ? Math.max(1, Math.round((y1 - y0) / course)) : 1;
  for (let i = 0; i < n; i++) {
    const aa = a0 + ((a1 - a0) * i) / n;
    const ab = a0 + ((a1 - a0) * (i + 1)) / n;
    for (let j = 0; j < rows; j++) {
      const ya = y0 + ((y1 - y0) * j) / rows;
      const yb = y0 + ((y1 - y0) * (j + 1)) / rows;
      const c = color(i, j);
      q.push([polar(r1, aa, ya), polar(r1, ab, ya), polar(r1, ab, yb), polar(r1, aa, yb), c]);
      q.push([polar(r0, ab, ya), polar(r0, aa, ya), polar(r0, aa, yb), polar(r0, ab, yb), c]);
    }
    const ct = color(i, rows);
    q.push([polar(r0, aa, y1), polar(r1, aa, y1), polar(r1, ab, y1), polar(r0, ab, y1), ct]);
    q.push([polar(r1, aa, y0), polar(r0, aa, y0), polar(r0, ab, y0), polar(r1, ab, y0), ct]);
  }
  if (ends) {
    const c0 = color(0, 0);
    q.push([polar(r0, a0, y0), polar(r1, a0, y0), polar(r1, a0, y1), polar(r0, a0, y1), c0]);
    q.push([polar(r1, a1, y0), polar(r0, a1, y0), polar(r0, a1, y1), polar(r1, a1, y1), c0]);
  }
  return quads(q);
}

/** A stone in courses, laid in running bond: piece i, course j (weathered green-dark at the foot). */
const _c = new THREE.Color();
const _moss = new THREE.Color('#5f6650');
const bond = (seed, foot = 4) => (i, j) => {
  _c.set(pick(STONE, Math.floor((i + (j % 2) * 0.5) / 2), j + seed));
  if (j < foot) _c.lerp(_moss, 0.35 * (1 - j / foot));
  return _c.getHex();
};

export class Beacon {
  constructor({ scene, world, puzzles, progress }) {
    this.world = world;
    const f = towerFrame();
    this.frame = f;
    this.group = new THREE.Group();
    this.group.name = 'beacon';
    this.group.position.set(f.x, f.y, f.z);
    this.group.rotation.y = f.yaw;
    scene.add(this.group);
    this.group.updateMatrixWorld(true);
    this.matrix = this.group.matrixWorld.clone();
    this.inverse = this.matrix.clone().invert();
    this.quat = this.group.quaternion.clone();
    this.center = V(f.x, f.y, f.z);

    const parts = [];
    this.#walls(parts);
    this.#stair(parts);
    this.#floor(parts);
    this.#rubble(parts);
    const mat = deepenShadows(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(mergeParts(parts), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.#colliders();
    this.#rope();
    this.#lamp();
    this.#stones(scene, world);

    // The stone by the door.
    const da = TOWER.door.a + 0.42;
    const sp = polar(TOWER.r + 0.55, da, 0.42);
    const nm = new THREE.Matrix4().compose(sp, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, Math.PI / 2 - da, 0, 'YXZ')), V(1, 1, 1));
    puzzles.addSlab(NOTE, 5513, nm.premultiply(this.matrix), 1.0, 0.75);
    this.solved = (progress.state?.solved ?? []).includes('beacon');
  }

  /** A point in the tower's frame, in the world. */
  #w(p) {
    return p.clone().applyMatrix4(this.matrix);
  }

  #d(v) {
    return v.clone().applyQuaternion(this.quat).normalize();
  }

  // -------------------------------------------------------------------------
  // Stonework
  // -------------------------------------------------------------------------

  #walls(parts) {
    const T = TOWER;
    const dh = T.door.half / ((T.r + T.inner) / 2);
    // Round from one side of the door to the other, the full height; over
    // the door, from its lintel up.
    parts.push(arcBlock({ r0: T.inner, r1: T.r, a0: T.door.a + dh, a1: T.door.a + TAU - dh, y0: -0.6, y1: T.floor, n: 60, course: 0.45, color: bond(0) }));
    parts.push(arcBlock({ r0: T.inner, r1: T.r, a0: T.door.a - dh, a1: T.door.a + dh, y0: T.door.h, y1: T.floor, n: 3, course: 0.45, color: bond(7), ends: false }));
    // A lintel stone, and a threshold.
    parts.push(arcBlock({ r0: T.inner - 0.05, r1: T.r + 0.08, a0: T.door.a - dh - 0.05, a1: T.door.a + dh + 0.05, y0: T.door.h, y1: T.door.h + 0.35, n: 3, color: () => STONE_DARK }));
    parts.push(arcBlock({ r0: T.inner, r1: T.r + 0.2, a0: T.door.a - dh, a1: T.door.a + dh, y0: -0.2, y1: 0.06, n: 3, color: () => STONE_DARK }));
    // What's left of the parapet: stumps here and there, none toward the stones.
    const toStones = stonesFromTower().a;
    for (let k = 0; k < 9; k++) {
      const a = T.door.a + 0.3 + k * 0.72 + hash2(k, 3, 91) * 0.25;
      const off = Math.abs(Math.atan2(Math.sin(a - toStones), Math.cos(a - toStones)));
      if (off < 0.9) continue;
      const w = 0.25 + hash2(k, 5, 91) * 0.3;
      const h = 0.18 + hash2(k, 7, 91) * 0.32;
      parts.push(arcBlock({ r0: T.inner, r1: T.r, a0: a, a1: a + w, y0: T.floor, y1: T.floor + h, n: 2, color: bond(20 + k) }));
    }
    // Arrow slits up the wall, dark.
    for (const [a, y] of [[1.6, 3.2], [3.4, 5.4], [5.3, 8.0], [0.9, 8.8], [2.6, 1.6]]) {
      const g = new THREE.BoxGeometry(0.06, 0.9, 0.16);
      g.translate(T.r + 0.005, y, 0);
      g.rotateY(-a);
      parts.push(paint(g, '#24221f'));
    }
  }

  #stair(parts) {
    const T = TOWER;
    const s = T.steps;
    // The newel, up the middle to the lamp floor.
    const newel = new THREE.CylinderGeometry(T.newel, T.newel + 0.04, T.floor + 0.6, 12, 1);
    newel.translate(0, T.floor / 2 - 0.3, 0);
    parts.push(paint(newel, STONE[1]));
    for (let k = 0; k < s.n; k++) {
      const { a, y } = towerStep(k);
      const a0 = a - s.turn / 2;
      const a1 = a + s.turn / 2 - 0.01;
      if (stepStands(k)) {
        parts.push(arcBlock({ r0: T.newel - 0.02, r1: T.inner + 0.02, a0, a1, y0: y - s.thick, y1: y, n: 3, color: (i) => pick(FLAG, k, i) }));
      } else {
        // Broken off: a stub in the wall and a stub on the newel.
        parts.push(arcBlock({ r0: T.inner - 0.3 - hash2(k, 1, 7) * 0.25, r1: T.inner + 0.02, a0, a1, y0: y - s.thick, y1: y - 0.04, n: 1, color: () => STONE_DARK }));
        parts.push(arcBlock({ r0: T.newel - 0.02, r1: T.newel + 0.15 + hash2(k, 2, 7) * 0.2, a0, a1, y0: y - s.thick, y1: y - 0.06, n: 1, color: () => STONE_DARK }));
      }
    }
  }

  #floor(parts) {
    const T = TOWER;
    const g = floorGap();
    const a0 = g.to;
    const a1 = g.from + TAU;
    const n = Math.ceil((a1 - a0) / 0.2);
    parts.push(arcBlock({ r0: T.newel - 0.02, r1: T.inner + 0.02, a0, a1, y0: T.floor - 0.34, y1: T.floor, n, color: (i, j) => (j > 0 ? pick(FLAG, i, 3) : STONE_DARK) }));
    // Broken flags along the edge that fell.
    for (let k = 0; k < 4; k++) {
      const r = T.newel + 0.4 + k * 0.75;
      for (const [edge, dir] of [[g.from, 1], [g.to, -1]]) {
        const w = 0.08 + hash2(k, edge * 10, 3) * 0.12;
        const aa = dir > 0 ? edge : edge - w;
        parts.push(arcBlock({ r0: r, r1: r + 0.6, a0: aa, a1: aa + w, y0: T.floor - 0.34, y1: T.floor - 0.02 - hash2(k, dir, 5) * 0.1, n: 1, color: () => STONE_DARK }));
      }
    }
    // The joist that's still there, out over the gap, the rope tied to it.
    const ja = this.#ropeAt().a;
    const j = new THREE.BoxGeometry(T.inner - T.newel + 0.3, 0.24, 0.2);
    j.translate((T.inner + T.newel) / 2, T.floor - 0.46, 0);
    j.rotateY(-ja);
    parts.push(paint(j, WOOD));
  }

  #rubble(parts) {
    const T = TOWER;
    // What fell, in a heap on the ground floor against the wall (under the
    // stair's second turn, clear of the door and the bottom steps), and some outside.
    let n = 0;
    for (let a = 3.6; a < 5.0; a += 0.32) {
      const r = T.inner - 0.6 - hash2(n, 1, 13) * 0.9;
      const g = rock(0.45 + hash2(n, 2, 13) * 0.35, 7100 + n, pick(STONE, n, 9), 0.6);
      g.translate(Math.cos(a) * r, 0.15, Math.sin(a) * r);
      parts.push(g);
      n++;
    }
    for (const [a, r, sz] of [[2.4, 6.2, 0.6], [2.75, 7.4, 0.45], [3.9, 6.0, 0.7], [4.3, 8.5, 0.4], [5.6, 6.6, 0.5]]) {
      const g = rock(sz, 7200 + n++, pick(STONE, n, 11), 0.55);
      g.translate(Math.cos(a) * r, 0.1, Math.sin(a) * r);
      parts.push(g);
    }
  }

  // -------------------------------------------------------------------------
  // What you bump into
  // -------------------------------------------------------------------------

  /** A box in the tower's frame: centre (a Vector3), half sizes, turned to face angle a (x out from the middle). */
  #box(c, half, a = 0, flags = {}) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a).premultiply(this.quat);
    this.world.addStatic(makeBox({ center: this.#w(c), half, quaternion: q, ...flags }));
  }

  /** An annular sector as boxes (bands out from the middle), top at y, thick. */
  #sector(a, turn, y, thick, r0 = TOWER.newel, r1 = TOWER.inner, flags = {}) {
    const bands = [[r0, (r0 + r1) / 2 - 0.3], [(r0 + r1) / 2 - 0.3, r1 - 0.95], [r1 - 0.95, r1]];
    for (const [ra, rb] of bands) {
      const rm = (ra + rb) / 2;
      this.#box(polar(rm, a, y - thick / 2), V((rb - ra) / 2 + 0.02, thick / 2, (turn * rb) / 2), a, flags);
    }
  }

  #colliders() {
    const T = TOWER;
    // The wall: a ring of boxes, the door between two of them.
    const n = 32;
    const da = TAU / n;
    const rm = (T.r + T.inner) / 2;
    const th = (T.r - T.inner) / 2;
    for (let i = 0; i < n; i++) {
      const a = T.door.a + da / 2 + i * da;
      const half = V(th, 0, rm * Math.tan(da / 2) + 0.06);
      const door = i === 0 || i === n - 1;
      const y0 = door ? T.door.h : -1;
      half.y = (T.floor - y0) / 2;
      this.#box(V(Math.cos(a) * rm, (T.floor + y0) / 2, Math.sin(a) * rm), half, a, { noGrab: !door });
    }
    // The newel; the stair; the lamp floor.
    this.world.addStatic({ type: 'cyl', x: this.center.x, z: this.center.z, r: T.newel, y0: this.center.y - 1, y1: this.center.y + T.floor, noClimb: true });
    const s = T.steps;
    for (let k = 0; k < s.n; k++) {
      if (!stepStands(k)) continue;
      const { a, y } = towerStep(k);
      this.#sector(a, s.turn, y, 0.3);
    }
    const g = floorGap();
    const a0 = g.to;
    const a1 = g.from + TAU;
    const m = Math.ceil((a1 - a0) / 0.2);
    for (let i = 0; i < m; i++) {
      const w = (a1 - a0) / m;
      this.#sector(a0 + (i + 0.5) * w, w, T.floor, 0.34);
    }
    // The heap of what fell.
    for (let a = 3.6; a < 5.0; a += 0.32) {
      const p = this.#w(polar(T.inner - 1.05, a, 0));
      this.world.addStatic({ type: 'cyl', x: p.x, z: p.z, r: 0.45, y0: this.center.y - 1, y1: this.center.y + 0.55 });
    }
  }

  // -------------------------------------------------------------------------
  // The rope
  // -------------------------------------------------------------------------

  /** Where the rope hangs: out over the gap, a jump from the last step. */
  #ropeAt() {
    return { a: floorGap().from + 0.38, r: 2.35, top: TOWER.floor - 0.58, bottom: 6.5 };
  }

  #rope() {
    const R = this.#ropeAt();
    const p = polar(R.r, R.a, 0);
    const rope = new THREE.Mesh(
      paint(segment(V(p.x, R.bottom, p.z), V(p.x, R.top + 0.2, p.z), 0.035, 0.035, 5), ROPE),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    rope.castShadow = true;
    this.group.add(rope);
    // A knot at the bottom.
    const knot = new THREE.Mesh(paint(new THREE.IcosahedronGeometry(0.07, 0), ROPE), rope.material);
    knot.position.set(p.x, R.bottom + 0.05, p.z);
    this.group.add(knot);
    // Climbable: across is out from the middle; facing round the tower.
    const out = V(Math.cos(R.a), 0, Math.sin(R.a));
    const round = V(-Math.sin(R.a), 0, Math.cos(R.a));
    const w = 1.2;
    this.world.climbables ??= [];
    const exit = polar(2.3, floorGap().from - 0.25, TOWER.floor + 0.05);
    this.world.climbables.push({
      o: this.#w(V(p.x, R.bottom, p.z).addScaledVector(out, -w / 2)),
      r: this.#d(out),
      u: V(0, 1, 0),
      n: this.#d(round),
      w,
      h: R.top - R.bottom,
      rope: true,
      exit: this.#w(exit),
    });
  }

  // -------------------------------------------------------------------------
  // The lamp
  // -------------------------------------------------------------------------

  #lamp() {
    const T = TOWER;
    const ironMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // The post (fixed), up from the top of the newel.
    const post = new THREE.Mesh(paint(segment(V(0, T.floor - 0.1, 0), V(0, T.lamp.y - 0.45, 0), T.lamp.post, T.lamp.post * 0.8, 8), IRON), ironMat);
    post.castShadow = true;
    this.group.add(post);
    // What turns: the lantern and its hood, the chain, the capstan bars.
    this.head = new THREE.Group();
    const hp = [];
    const box = (w, h, d, x, y, z, c) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      hp.push(paint(g, c));
    };
    const y = T.lamp.y;
    box(0.9, 0.08, 0.8, 0, y - 0.42, 0, IRON); // base plate
    box(0.9, 0.1, 0.8, 0, y + 0.42, 0, IRON); // top plate
    for (const [x, z] of [[-0.42, -0.37], [-0.42, 0.37], [0.42, -0.37], [0.42, 0.37]]) box(0.06, 0.84, 0.06, x, y, z, IRON);
    // The reflector at the back, a dome, and the lens at the front (+x).
    const refl = new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI);
    refl.rotateY(Math.PI / 2);
    refl.translate(-0.05, y, 0);
    hp.push(paint(refl, '#8f8a7c'));
    const hood = new THREE.ConeGeometry(0.62, 0.45, 8);
    hood.rotateY(Math.PI / 8);
    hood.translate(0, y + 0.68, 0);
    hp.push(paint(hood, IRON));
    const ring = new THREE.TorusGeometry(0.1, 0.025, 4, 8);
    ring.translate(0, y + 0.95, 0);
    hp.push(paint(ring, IRON));
    // Capstan bars at the post's foot, to turn it by.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + Math.PI / 4;
      hp.push(paint(segment(V(0, T.floor + 0.95, 0), polar(0.95, a, T.floor + 0.95), 0.04, 0.035, 5), WOOD));
    }
    const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.2, 8);
    hub.translate(0, T.floor + 0.95, 0);
    hp.push(paint(hub, IRON));
    // The chain that opens the oil to the wick.
    const links = Math.round((y - 0.5 - (T.floor + 1.15)) / 0.07);
    for (let k = 0; k < links; k++) {
      const l = new THREE.TorusGeometry(0.035, 0.009, 3, 6);
      if (k % 2) l.rotateY(Math.PI / 2);
      l.translate(-0.42, y - 0.5 - k * 0.07, -0.37);
      hp.push(paint(l, IRON));
    }
    box(0.2, 0.04, 0.04, -0.42, y - 0.52 - links * 0.07, -0.37, WOOD); // a toggle to pull it by
    this.head.add(new THREE.Mesh(mergeParts(hp), ironMat));
    this.head.children[0].castShadow = true;
    // The lens and the flame behind it, which light up.
    this.lensMat = new THREE.MeshBasicMaterial({ color: '#3d4446' });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.34, 14), this.lensMat);
    lens.rotation.y = Math.PI / 2;
    lens.position.set(0.43, y, 0);
    this.head.add(lens);
    this.group.add(this.head);

    // The beam (in the world, from the lens to where it falls) and the pool of light there.
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uLit: { value: 0 }, uStrength: { value: 0.3 }, uColor: { value: new THREE.Color('#ffe2a8') } },
      vertexShader: /* glsl */ `
        varying float vAlong;
        varying vec3 vN;
        varying vec3 vView;
        void main() {
          vAlong = uv.y;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = mat3(modelMatrix) * normal;
          vView = cameraPosition - wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uLit, uStrength;
        uniform vec3 uColor;
        varying float vAlong;
        varying vec3 vN;
        varying vec3 vView;
        void main() {
          // (Lengths kept off zero: a NaN here would be squares on the screen.)
          float face = abs(dot(vN, vView)) / max(length(vN) * length(vView), 1e-4);
          face = face * sqrt(face);
          float fall = 0.25 + 0.75 * clamp(vAlong, 0.0, 1.0) * clamp(vAlong, 0.0, 1.0);
          gl_FragColor = vec4(uColor * uStrength * uLit * face * fall, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cone = new THREE.ConeGeometry(1, 1, 20, 1, true);
    cone.translate(0, -0.5, 0); // apex at the lamp, down −y
    this.beam = new THREE.Mesh(cone, this.beamMat);
    this.beam.frustumCulled = false;
    this.beam.visible = false;
    this.group.parent.add(this.beam);

    const RINGS = 4;
    const SEG = 28;
    this.poolR = 4.6;
    const pos = new Float32Array((1 + RINGS * SEG) * 3);
    const fade = new Float32Array(1 + RINGS * SEG);
    const idx = [];
    fade[0] = 1;
    for (let r = 1; r <= RINGS; r++) {
      for (let k = 0; k < SEG; k++) {
        const i = 1 + (r - 1) * SEG + k;
        fade[i] = 1 - r / RINGS;
        const inner = r === 1 ? null : 1 + (r - 2) * SEG;
        const a = 1 + (r - 1) * SEG;
        const k1 = (k + 1) % SEG;
        if (inner === null) idx.push(0, a + k1, a + k);
        else idx.push(inner + k, inner + k1, a + k1, inner + k, a + k1, a + k);
      }
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('fade', new THREE.BufferAttribute(fade, 1));
    pg.setIndex(idx);
    this.poolRings = RINGS;
    this.poolSeg = SEG;
    this.poolMat = new THREE.ShaderMaterial({
      uniforms: { uLit: { value: 0 }, uStrength: { value: 0.55 }, uColor: { value: new THREE.Color('#ffd98f') } },
      vertexShader: /* glsl */ `
        attribute float fade;
        varying float vFade;
        void main() {
          vFade = fade;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uLit, uStrength;
        uniform vec3 uColor;
        varying float vFade;
        void main() {
          float k = clamp(vFade, 0.0, 1.0);
          gl_FragColor = vec4(uColor * uStrength * uLit * k * k * (3.0 - 2.0 * k), 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.pool = new THREE.Mesh(pg, this.poolMat);
    this.pool.frustumCulled = false;
    this.pool.visible = false;
    this.group.parent.add(this.pool);

    this.lit = 0; // 0…1, coming up as the oil takes
    this.burning = false;
    this.step = 4; // eighths of a turn round from the stones (it starts looking out to sea)
    this.yaw = lampAngle(this.step); // the angle it's at now (round from +x toward +z)
    this.turn = null; // { from, to, t }
    this.#aim();
  }

  /** Where the light falls with the lamp at angle a (tower frame): the world point. */
  #landing(a) {
    const d = stonesFromTower().dist;
    const p = this.#w(polar(d, a, 0));
    p.y = Math.max(groundAt(p.x, p.z), 0.2);
    return p;
  }

  /** Point the lamp, the beam and the pool at this.yaw. */
  #aim() {
    this.head.rotation.y = -this.yaw;
    const from = this.#w(polar(0.45, this.yaw, TOWER.lamp.y));
    const to = this.#landing(this.yaw);
    const dir = to.clone().sub(from);
    const len = dir.length();
    dir.divideScalar(len);
    this.beam.position.copy(from);
    this.beam.quaternion.setFromUnitVectors(V(0, -1, 0), dir);
    this.beam.scale.set(this.poolR * 0.75, len, this.poolR * 0.75);
    // The pool, lying on the ground round where it lands.
    const p = this.pool.geometry.attributes.position;
    p.setXYZ(0, to.x, groundAt(to.x, to.z) + 0.15, to.z);
    for (let r = 1; r <= this.poolRings; r++) {
      const rr = (this.poolR * r) / this.poolRings;
      for (let k = 0; k < this.poolSeg; k++) {
        const a = (k / this.poolSeg) * TAU;
        const x = to.x + Math.cos(a) * rr;
        const z = to.z + Math.sin(a) * rr;
        p.setXYZ(1 + (r - 1) * this.poolSeg + k, x, Math.max(groundAt(x, z), 0.1) + 0.15, z);
      }
    }
    p.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // The standing stones
  // -------------------------------------------------------------------------

  #stones(scene, world) {
    const isl = ISLAND_BY_ID.beacon;
    const s = isl.features.stones;
    const parts = [];
    const stone = (a, r, h, w, lean, seed) => {
      const p = toWorld(isl, s.x + Math.cos(a) * r, s.z + Math.sin(a) * r);
      const g0 = groundAt(p.x, p.z);
      const g = new THREE.BoxGeometry(w, h, w * 0.55, 1, 3, 1);
      // Weathered: narrower at the top, edges knocked about.
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / h + 0.5;
        const k = 1 - 0.3 * y;
        pos.setX(i, pos.getX(i) * k + (hash2(i, seed, 1) - 0.5) * 0.08);
        pos.setZ(i, pos.getZ(i) * k + (hash2(i, seed, 2) - 0.5) * 0.06);
        pos.setY(i, pos.getY(i) + (y > 0.9 ? (hash2(i, seed, 3) - 0.5) * 0.25 : 0));
      }
      g.rotateZ(lean);
      g.rotateY(a + 0.3 * (hash2(seed, 1, 4) - 0.5));
      g.translate(p.x, g0 + h / 2 - 0.35, p.z);
      parts.push(paint(g, seed % 2 ? '#8b877d' : '#7e7a72'));
      // Lichen round the foot.
      const l = rock(w * 0.45, 7300 + seed, '#6d7350', 0.35);
      l.translate(p.x, g0 + 0.05, p.z);
      parts.push(l);
      world.addStatic({ type: 'cyl', x: p.x, z: p.z, r: w * 0.45, y0: g0 - 1, y1: g0 + h - 0.4 });
    };
    stone(0.5, 4.6, 2.7, 1.0, 0.04, 1);
    stone(2.6, 4.8, 2.2, 0.9, -0.08, 2);
    stone(4.5, 4.5, 1.9, 0.85, 0.1, 3);
    // And one that's fallen, lying in the grass.
    const p = toWorld(isl, s.x + Math.cos(3.6) * 6.2, s.z + Math.sin(3.6) * 6.2);
    const g0 = groundAt(p.x, p.z);
    const fallen = new THREE.BoxGeometry(2.0, 0.55, 0.8);
    fallen.rotateY(1.1);
    fallen.translate(p.x, g0 + 0.1, p.z);
    parts.push(paint(fallen, '#827e75'));
    world.addStatic({ type: 'cyl', x: p.x, z: p.z, r: 0.75, y0: g0 - 1, y1: g0 + 0.38 });
    const m = new THREE.Mesh(mergeParts(parts), deepenShadows(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }

  // -------------------------------------------------------------------------

  /** Something to do here: light the lamp, or turn it. */
  interaction(player) {
    if (Math.abs(player.pos.x - this.center.x) > 8 || Math.abs(player.pos.z - this.center.z) > 8) return null;
    const l = _l.copy(player.pos).applyMatrix4(this.inverse);
    if (l.y < TOWER.floor - 0.4 || l.y > TOWER.floor + 1.5 || Math.hypot(l.x, l.z) > 2.0 || player.mode !== 'ground') return null;
    if (this.turn) return null;
    if (!this.burning) {
      return {
        key: 'E',
        label: 'Light the beacon',
        act: () => {
          this.burning = true;
          this.say?.('You pull the chain. The oil runs to the wick, and the old lamp takes.', 3.5);
        },
      };
    }
    return {
      key: 'E',
      label: 'Turn the lamp',
      act: () => {
        this.turn = { from: this.yaw, to: this.yaw + TAU / LAMP_STEPS, t: 0 };
        this.player = player;
        player.animOverride = 'crank';
        player.effort = 1;
      },
    };
  }

  update(dt, { night = 0 } = {}) {
    // Strong enough to see by day; softer at night, when it hardly needs it.
    this.beamMat.uniforms.uStrength.value = 0.22 + 0.5 * (1 - night);
    this.poolMat.uniforms.uStrength.value = 0.5 + 0.9 * (1 - night);
    // The oil taking.
    if (this.burning && this.lit < 1) this.lit = Math.min(1, this.lit + dt * 0.6);
    const flick = this.lit * (0.92 + 0.08 * Math.sin(performance.now() * 0.013) * Math.sin(performance.now() * 0.0071));
    this.lensMat.color.setRGB(0.24 + 2.6 * flick, 0.27 + 2.2 * flick, 0.27 + 1.3 * flick);
    this.beamMat.uniforms.uLit.value = flick;
    this.poolMat.uniforms.uLit.value = flick;
    this.beam.visible = this.pool.visible = this.lit > 0.01;
    // Turning.
    if (this.turn) {
      const T = this.turn;
      T.t = Math.min(1, T.t + dt / 1.3);
      const e = T.t * T.t * (3 - 2 * T.t);
      this.yaw = T.from + (T.to - T.from) * e;
      this.#aim();
      if (T.t >= 1) {
        this.turn = null;
        this.step = (this.step + 1) % LAMP_STEPS;
        this.yaw = lampAngle(this.step);
        this.#aim();
        if (this.player) {
          this.player.animOverride = null;
          this.player.effort = 0;
        }
        if (this.step === 0) this.say?.('The light falls into the hollow among the standing stones.', 4);
      }
    }
  }
}

const _l = new THREE.Vector3();
